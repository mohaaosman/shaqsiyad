# frozen_string_literal: true

require "json"
require "net/http"
require "uri"
require_relative "shaqsiyad/version"

# Client for the Shaqsiyad API: fictional people with faces, ethnicity, faith, careers and connections.
#
# Filters (snake_case or camelCase): q, gender, min_age, max_age, continent, country, ethnicity,
# religion, tier, mbti, relationship, industry, status. Same seed + same filters → same people.
module Shaqsiyad
  DEFAULT_BASE_URL = "https://shaqsiyad.example/api/v1"

  # An API or network error. +status+ is the HTTP status, or 0 for network errors and timeouts.
  class Error < StandardError
    attr_reader :status

    def initialize(status, message)
      @status = status
      super(status.zero? ? message : "#{status}: #{message}")
    end

    def api_message
      message.sub(/\A\d+: /, "")
    end
  end

  # What a transport returns: integer status, string body, lower-cased header hash.
  Response = Struct.new(:status, :body, :headers, keyword_init: true)

  class Client
    EXPORT_PATHS = { "personas" => "/personas", "random" => "/personas/random", "fixtures" => "/fixtures" }.freeze
    FORMATS = %w[csv ndjson].freeze

    attr_reader :base_url, :timeout, :retries

    # transport: ->(url, timeout) { Shaqsiyad::Response }, for tests or proxies.
    # sleeper:   ->(seconds) { ... }, used between retries.
    def initialize(base_url: nil, timeout: 30.0, retries: 1, transport: nil, sleeper: nil)
      env = ENV["SHAQSIYAD_BASE_URL"]
      @base_url = (base_url || (env.nil? || env.empty? ? nil : env) || DEFAULT_BASE_URL).sub(%r{/+\z}, "")
      @timeout = timeout
      @retries = retries
      @transport = transport || method(:default_transport)
      @sleeper = sleeper || ->(seconds) { sleep(seconds) }
    end

    def url(path, query = {})
      pairs = []
      query.each do |key, value|
        name = camel(key.to_s)
        Array(value).each do |item|
          next if item.nil? || item == ""

          pairs << "#{escape(name)}=#{escape(item.to_s)}"
        end
      end
      "#{@base_url}#{path}#{pairs.empty? ? "" : "?#{pairs.join("&")}"}"
    end

    def search(q = nil, **params)
      json("/personas", { q: q, **params })
    end

    # Every match across all pages, one summary at a time. Stops after +max+ people if given.
    def search_all(q = nil, max: nil, **params)
      return enum_for(:search_all, q, max: max, **params) unless block_given?

      params = { limit: 100, **params }
      yielded = 0
      page = 1
      loop do
        result = search(q, **params, page: page)
        people = result["results"] || []
        people.each do |person|
          return if max && yielded >= max

          yielded += 1
          yield person
        end
        return if page >= (result["pages"] || 0) || people.empty?

        page += 1
      end
    end

    def random(count = 5, **params)
      json("/personas/random", { count: count, **params })
    end

    def person(id_or_slug, fields: nil)
      json("/personas/#{escape(id_or_slug)}", { fields: fields&.join(",") })
    end

    def graph(id_or_slug, depth: 1)
      json("/personas/#{escape(id_or_slug)}/graph", { depth: depth })
    end

    # shape: users, customers, employees or patients.
    def fixtures(shape, **params)
      json("/fixtures", { shape: shape, **params })
    end

    # Raw CSV or NDJSON for "personas" (a search), "random" or "fixtures".
    def export(kind, format, **params)
      path = EXPORT_PATHS[kind.to_s] or raise ArgumentError, "kind must be personas, random or fixtures"
      raise ArgumentError, "format must be csv or ndjson" unless FORMATS.include?(format.to_s)

      get(path, { format: format, **params })
    end

    def households(**params)
      json("/households", params)
    end

    # size, industry, seed
    def team(**params)
      json("/teams", params)
    end

    def stats
      json("/stats")
    end

    def avatar_url(id_or_slug, size: nil, format: nil)
      url("/personas/#{escape(id_or_slug)}/avatar", { size: size, format: format })
    end

    def sheet_url(**params)
      url("/sheet.png", params)
    end

    private

    def camel(key)
      key.gsub(/_([a-z])/) { Regexp.last_match(1).upcase }
    end

    def escape(value)
      URI.encode_www_form_component(value.to_s).gsub("+", "%20")
    end

    def get(path, query = {})
      attempt = 0
      loop do
        begin
          res = @transport.call(url(path, query), @timeout)
        rescue Error
          raise
        rescue StandardError, Timeout::Error => e
          raise Error.new(0, e.message)
        end
        if (res.status == 429 || res.status >= 500) && attempt < @retries
          after = Float(res.headers&.fetch("retry-after", nil), exception: false)
          @sleeper.call(after && after >= 0 ? after : 2**attempt)
          attempt += 1
          next
        end
        unless (200..299).cover?(res.status)
          raise Error.new(res.status, error_message(res))
        end

        return res.body
      end
    end

    def error_message(res)
      body = JSON.parse(res.body.to_s)
      body.is_a?(Hash) && body["error"] ? body["error"].to_s : reason(res.status)
    rescue JSON::ParserError
      reason(res.status)
    end

    def json(path, query = {})
      JSON.parse(get(path, query))
    rescue JSON::ParserError => e
      raise Error.new(0, "Bad JSON: #{e.message}")
    end

    def reason(status)
      { 400 => "Bad Request", 404 => "Not Found", 429 => "Too Many Requests", 500 => "Internal Server Error",
        503 => "Service Unavailable" }.fetch(status, "HTTP error")
    end

    def default_transport(url, timeout)
      uri = URI(url)
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = uri.scheme == "https"
      http.open_timeout = timeout
      http.read_timeout = timeout
      req = Net::HTTP::Get.new(uri)
      req["User-Agent"] = "shaqsiyad-ruby/#{VERSION}"
      res = http.request(req)
      headers = res.each_header.to_h { |k, v| [k.downcase, v] }
      Response.new(status: res.code.to_i, body: res.body.to_s, headers: headers)
    end
  end

  # Shaqsiyad.new(...) is shorthand for Shaqsiyad::Client.new(...).
  def self.new(**options)
    Client.new(**options)
  end
end
