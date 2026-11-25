# shaqsiyad/shaqsiyad (PHP)

PHP client for the [Shaqsiyad API](https://github.com/mohaaosman/shaqsiyad): fictional people with faces, ethnicity, faith, careers and connections. PHP 8.1+, no runtime dependencies (uses cURL when available, PHP streams otherwise).

```sh
composer require shaqsiyad/shaqsiyad
```

```php
use Shaqsiyad\Shaqsiyad;

$api = new Shaqsiyad();

$nurses   = $api->search('nurse', ['continent' => 'Africa', 'limit' => 10]);
$cast     = $api->random(8, ['min_age' => 25, 'max_age' => 40, 'seed' => 7]); // snake_case or camelCase
$amina    = $api->person($cast[0]['id'], fields: ['fullName', 'career']);
$users    = $api->fixtures('users', ['count' => 50, 'seed' => 1]);
$csv      = $api->export('fixtures', 'csv', ['shape' => 'employees', 'count' => 100]);
$team     = $api->team(['size' => 6, 'industry' => 'Healthcare']);
$face     = $api->avatarUrl($cast[0]['id'], 128, 'png');

foreach ($api->searchAll(params: ['religion' => 'Muslim', 'country' => 'Kenya'], max: 500) as $person) {
    echo $person['fullName'], PHP_EOL;
}
```

Same `seed` + same filters → same people.

## Laravel seeder

```php
public function run(Shaqsiyad $api): void
{
    foreach ($api->fixtures('users', ['count' => 50, 'seed' => 1]) as $person) {
        User::updateOrCreate(['email' => $person['email']], ['name' => $person['fullName'], 'password' => Hash::make('password')]);
    }
}
```

## Options

```php
new Shaqsiyad(
    baseUrl: 'http://localhost:8000/api/v1', // or SHAQSIYAD_BASE_URL
    timeout: 10.0,                           // seconds, default 30
    retries: 2,                              // 429/5xx retries, default 1
    transport: fn (string $url, float $timeout) => new \Shaqsiyad\Response(200, '[]'), // custom HTTP, e.g. for tests
);
```

Errors throw `Shaqsiyad\ShaqsiyadException` with `getStatus()` (0 for network errors and timeouts) and `getApiMessage()`.

## Tests

```sh
composer install && composer test
```
