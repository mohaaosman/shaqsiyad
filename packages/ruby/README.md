# shaqsiyad (Ruby)

Ruby client for the [Shaqsiyad API](https://github.com/mohaaosman/shaqsiyad). Standard library only (Net::HTTP + JSON), Ruby 3.1+.

```sh
gem install shaqsiyad
```

```ruby
require "shaqsiyad"

api = Shaqsiyad.new
nurses    = api.search("nurse", continent: "Africa", limit: 10)
cast      = api.random(8, min_age: 25, max_age: 40, seed: 7)   # snake_case or camelCase
amina     = api.person(cast.first["id"], fields: %w[fullName career])
customers = api.fixtures("customers", count: 100, seed: 2)
csv       = api.export("fixtures", "csv", shape: "users", count: 50, seed: 1)
team      = api.team(size: 6, industry: "Healthcare", seed: 3)
face      = api.avatar_url(cast.first["id"], size: 128)

api.search_all(religion: "Muslim", country: "Kenya", max: 500).each do |person|
  puts person["fullName"]
end
```

Same `seed` + same filters → same people. `search_all` without a block returns a lazy `Enumerator`, so `api.search_all.first(10)` fetches only what it needs.

## Options

```ruby
Shaqsiyad.new(
  base_url: "http://localhost:8000/api/v1", # or set SHAQSIYAD_BASE_URL
  timeout: 10.0,                            # seconds, default 30
  retries: 2,                               # retries on 429/5xx, default 1
  transport: ->(url, timeout) { ... }       # return Shaqsiyad::Response, for tests or proxies
)
```

Errors raise `Shaqsiyad::Error` with `#status` (0 for network errors and timeouts) and `#api_message`. A `429` or `5xx` is retried after `retry-after`.

## Seeding Rails

```ruby
# db/seeds.rb
Shaqsiyad.new.fixtures("users", count: 50, seed: 1).each do |u|
  User.find_or_create_by!(email: u["email"]) { |user| user.name = u["fullName"] }
end
```

## Tests

```sh
ruby -Ilib -Itest test/test_shaqsiyad.rb   # or: bundle install && bundle exec rake
```
