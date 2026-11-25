# frozen_string_literal: true

require "minitest/autorun"
require "socket"
require "shaqsiyad"

class ShaqsiyadTest < Minitest::Test
  BASE = "https://api.test/v1"

  def setup
    @calls = []
    @sleeps = []
  end

  # A client whose transport answers from +replies+ in order (the last repeats), or from a block given the URL.
  def client(replies = [], retries: 1, &responder)
    replies = replies.dup
    transport = lambda do |url, _timeout|
      @calls << url
      next responder.call(url) if responder

      reply = replies.length > 1 ? replies.shift : replies.first
      raise reply if reply.is_a?(Exception)

      reply
    end
    Shaqsiyad.new(base_url: "#{BASE}/", retries: retries, transport: transport, sleeper: ->(s) { @sleeps << s })
  end

  def ok(body, headers: {}, status: 200)
    Shaqsiyad::Response.new(status: status, body: body.is_a?(String) ? body : JSON.generate(body), headers: headers)
  end

  def page(number, pages, ids)
    ok({ "page" => number, "pages" => pages, "results" => ids.map { |id| { "id" => id } } })
  end

  def test_url_drops_empty_values_repeats_arrays_and_camel_cases
    api = Shaqsiyad.new(base_url: "#{BASE}/")
    assert_equal "#{BASE}/personas?q=nurse&tier=warm&tier=soft&minAge=30&full=true",
                 api.url("/personas", { q: "nurse", tier: %w[warm soft], gender: nil, country: "", min_age: 30, full: true })
    assert_equal "#{BASE}/personas/amina%20farah/avatar?size=128", api.avatar_url("amina farah", size: 128)
  end

  def test_env_base_url
    ENV["SHAQSIYAD_BASE_URL"] = "http://localhost:9000/api/v1/"
    assert_equal "http://localhost:9000/api/v1", Shaqsiyad.new.base_url
  ensure
    ENV.delete("SHAQSIYAD_BASE_URL")
    assert_equal Shaqsiyad::DEFAULT_BASE_URL, Shaqsiyad.new.base_url
  end

  def test_random_sends_filters_and_returns_body
    people = client([ok([{ "id" => "shq_1" }])]).random(2, seed: 7, min_age: 30, maxAge: 40)
    assert_equal [{ "id" => "shq_1" }], people
    assert_equal "#{BASE}/personas/random?count=2&seed=7&minAge=30&maxAge=40", @calls.first
  end

  def test_person_fields
    client([ok({ "id" => "shq_1" })]).person("shq_1", fields: %w[fullName career])
    assert_equal "#{BASE}/personas/shq_1?fields=fullName%2Ccareer", @calls.first
  end

  def test_error_carries_status_and_api_message
    err = assert_raises(Shaqsiyad::Error) { client([ok({ "error" => "No such person" }, status: 404)]).person("nobody") }
    assert_equal 404, err.status
    assert_equal "No such person", err.api_message
  end

  def test_network_failure_is_status_zero
    err = assert_raises(Shaqsiyad::Error) { client([SocketError.new("getaddrinfo failed")]).stats }
    assert_equal 0, err.status
    assert_match(/getaddrinfo/, err.message)
  end

  def test_retries_429_after_retry_after_then_succeeds
    api = client([ok({ "error" => "slow" }, status: 429, headers: { "retry-after" => "0.25" }), ok({ "total" => 1 })])
    assert_equal({ "total" => 1 }, api.stats)
    assert_equal 2, @calls.length
    assert_equal [0.25], @sleeps
  end

  def test_gives_up_after_configured_retries
    err = assert_raises(Shaqsiyad::Error) { client([ok({ "error" => "down" }, status: 503)], retries: 2).stats }
    assert_equal 503, err.status
    assert_equal 3, @calls.length
    assert_equal [1, 2], @sleeps # no retry-after: 1s, then 2s
  end

  def test_does_not_retry_other_client_errors
    assert_raises(Shaqsiyad::Error) { client([ok({ "error" => "bad" }, status: 400)]).stats }
    assert_equal 1, @calls.length
  end

  def test_error_without_json_body_uses_reason
    err = assert_raises(Shaqsiyad::Error) { client([ok("<html>", status: 500)], retries: 0).stats }
    assert_equal "Internal Server Error", err.api_message
  end

  def test_search_all_walks_every_page_and_honours_max
    pages = { 1 => %w[a b], 2 => %w[c d], 3 => %w[e] }
    api = client { |url| n = url[/page=(\d+)/, 1].to_i; page(n, 3, pages[n]) }
    assert_equal %w[a b c d e], api.search_all("nurse", limit: 2).map { |p| p["id"] }
    assert_match(/page=3/, @calls[2])
    assert_match(/q=nurse/, @calls[0])

    @calls.clear
    assert_equal %w[a b c], api.search_all(max: 3, limit: 2).map { |p| p["id"] }
    assert_equal 2, @calls.length
  end

  def test_search_all_is_lazy_enumerator
    api = client { |url| n = url[/page=(\d+)/, 1].to_i; page(n, 100, ["p#{n}"]) }
    assert_equal %w[p1 p2], api.search_all.first(2).map { |p| p["id"] }
    assert_equal 2, @calls.length
  end

  def test_export_returns_raw_text_and_validates
    api = client([ok("id,name\n1,A\n")])
    assert_equal "id,name\n1,A\n", api.export("random", "csv", count: 1)
    api.export(:fixtures, "ndjson", shape: "users")
    assert_equal "#{BASE}/personas/random?format=csv&count=1", @calls[0]
    assert_equal "#{BASE}/fixtures?format=ndjson&shape=users", @calls[1]
    assert_raises(ArgumentError) { api.export("nope", "csv") }
    assert_raises(ArgumentError) { api.export("random", "xml") }
  end

  def test_fixtures_team_households_graph_and_sheet
    api = client([ok([])])
    api.fixtures("customers", count: 10, seed: 2, country: "Kenya")
    api.team(size: 6, industry: "Healthcare", seed: 3)
    api.households(count: 2, religion: "Muslim")
    api.graph("shq_1", depth: 2)
    assert_equal "#{BASE}/fixtures?shape=customers&count=10&seed=2&country=Kenya", @calls[0]
    assert_equal "#{BASE}/teams?size=6&industry=Healthcare&seed=3", @calls[1]
    assert_equal "#{BASE}/households?count=2&religion=Muslim", @calls[2]
    assert_equal "#{BASE}/personas/shq_1/graph?depth=2", @calls[3]
    assert_equal "#{BASE}/sheet.png?count=12&seed=1", api.sheet_url(count: 12, seed: 1)
  end

  def test_seed_zero_is_sent
    client([ok([])]).random(1, seed: 0)
    assert_match(/seed=0/, @calls.first)
  end

  # End to end with the default Net::HTTP transport against a tiny local server.
  def test_default_transport_against_local_server
    server = TCPServer.new("127.0.0.1", 0)
    port = server.addr[1]
    requests = []
    replies = [[429, '{"error":"slow"}', "Retry-After: 0\r\n"], [200, '[{"id":"shq_9"}]', ""]]
    thread = Thread.new do
      replies.each do |status, body, extra|
        sock = server.accept
        requests << sock.gets
        while (line = sock.gets) && line != "\r\n"; end
        sock.write("HTTP/1.1 #{status} X\r\nContent-Type: application/json\r\n#{extra}Content-Length: #{body.bytesize}\r\nConnection: close\r\n\r\n#{body}")
        sock.close
      end
    end
    api = Shaqsiyad.new(base_url: "http://127.0.0.1:#{port}/api/v1", timeout: 5)
    assert_equal [{ "id" => "shq_9" }], api.random(1, seed: 3)
    thread.join(5)
    assert_equal 2, requests.length
    assert_match(%r{\AGET /api/v1/personas/random\?count=1&seed=3 HTTP/1\.1}, requests.first)
  ensure
    server&.close
  end

  def test_default_transport_network_error
    server = TCPServer.new("127.0.0.1", 0)
    port = server.addr[1]
    server.close
    err = assert_raises(Shaqsiyad::Error) { Shaqsiyad.new(base_url: "http://127.0.0.1:#{port}", retries: 0, timeout: 2).stats }
    assert_equal 0, err.status
  end
end
