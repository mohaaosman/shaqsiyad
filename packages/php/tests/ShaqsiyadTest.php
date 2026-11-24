<?php

declare(strict_types=1);

namespace Shaqsiyad\Tests;

use PHPUnit\Framework\TestCase;
use Shaqsiyad\Response;
use Shaqsiyad\Shaqsiyad;
use Shaqsiyad\ShaqsiyadException;

final class ShaqsiyadTest extends TestCase
{
    private const BASE = 'https://api.test/v1';

    /** @var list<string> */
    private array $calls = [];

    /** @var list<float> */
    private array $sleeps = [];

    /**
     * A client whose transport answers from $replies in order (the last repeats),
     * or from a callable given the URL.
     */
    private function client(array|\Closure $replies, int $retries = 1): Shaqsiyad
    {
        $transport = function (string $url) use (&$replies): Response {
            $this->calls[] = $url;
            if ($replies instanceof \Closure) {
                return $replies($url);
            }
            $next = count($replies) > 1 ? array_shift($replies) : $replies[0];
            if ($next instanceof \Throwable) {
                throw $next;
            }
            return $next;
        };
        return new Shaqsiyad(self::BASE . '/', retries: $retries, transport: $transport, sleep: function (float $s): void {
            $this->sleeps[] = $s;
        });
    }

    private static function ok(mixed $body, array $headers = [], int $status = 200): Response
    {
        return new Response($status, is_string($body) ? $body : json_encode($body), $headers);
    }

    public function testUrlDropsEmptyValuesRepeatsArraysAndCamelCases(): void
    {
        $api = new Shaqsiyad(self::BASE . '/');
        $this->assertSame(
            self::BASE . '/personas?q=nurse&tier=warm&tier=soft&minAge=30&full=true',
            $api->url('/personas', ['q' => 'nurse', 'tier' => ['warm', 'soft'], 'gender' => null, 'country' => '', 'min_age' => 30, 'full' => true]),
        );
        $this->assertSame(self::BASE . '/personas/amina%20farah/avatar?size=128', $api->avatarUrl('amina farah', 128));
    }

    public function testEnvBaseUrl(): void
    {
        putenv('SHAQSIYAD_BASE_URL=http://localhost:9/v1/');
        try {
            $this->assertSame('http://localhost:9/v1', (new Shaqsiyad())->baseUrl);
        } finally {
            putenv('SHAQSIYAD_BASE_URL');
        }
        $this->assertSame(Shaqsiyad::DEFAULT_BASE_URL, (new Shaqsiyad())->baseUrl);
    }

    public function testRandomSendsFilters(): void
    {
        $people = $this->client([self::ok([['id' => 'shq_1']])])->random(2, ['seed' => 7, 'minAge' => 30]);
        $this->assertSame([['id' => 'shq_1']], $people);
        $this->assertSame(self::BASE . '/personas/random?count=2&seed=7&minAge=30', $this->calls[0]);
    }

    public function testPersonFields(): void
    {
        $this->client([self::ok(['id' => 'shq_1'])])->person('shq_1', ['fullName', 'career']);
        $this->assertSame(self::BASE . '/personas/shq_1?fields=fullName%2Ccareer', $this->calls[0]);
    }

    public function testErrorCarriesStatusAndApiMessage(): void
    {
        try {
            $this->client([self::ok(['error' => 'No such person'], status: 404)])->person('nobody');
            $this->fail('expected exception');
        } catch (ShaqsiyadException $e) {
            $this->assertSame(404, $e->getStatus());
            $this->assertSame('No such person', $e->getApiMessage());
        }
    }

    public function testRetries429AfterRetryAfterThenSucceeds(): void
    {
        $api = $this->client([self::ok(['error' => 'slow down'], ['retry-after' => '0.5'], 429), self::ok(['total' => 3])]);
        $this->assertSame(['total' => 3], $api->stats());
        $this->assertCount(2, $this->calls);
        $this->assertSame([0.5], $this->sleeps);
    }

    public function testGivesUpAfterRetries(): void
    {
        $api = $this->client([self::ok(['error' => 'down'], status: 503)], retries: 2);
        try {
            $api->stats();
            $this->fail('expected exception');
        } catch (ShaqsiyadException $e) {
            $this->assertSame(503, $e->getStatus());
        }
        $this->assertCount(3, $this->calls);
        $this->assertSame([1, 2], array_map('intval', $this->sleeps));
    }

    public function testNoRetryOnOtherClientErrors(): void
    {
        $this->expectException(ShaqsiyadException::class);
        try {
            $this->client([self::ok(['error' => 'bad'], status: 400)])->stats();
        } finally {
            $this->assertCount(1, $this->calls);
        }
    }

    public function testTransportFailureIsStatusZero(): void
    {
        try {
            $this->client([new \RuntimeException('connection refused')])->stats();
            $this->fail('expected exception');
        } catch (ShaqsiyadException $e) {
            $this->assertSame(0, $e->getStatus());
            $this->assertSame('connection refused', $e->getMessage());
        }
    }

    public function testRealNetworkErrorIsStatusZero(): void
    {
        try {
            (new Shaqsiyad('http://127.0.0.1:1/api/v1', timeout: 2, retries: 0))->stats();
            $this->fail('expected exception');
        } catch (ShaqsiyadException $e) {
            $this->assertSame(0, $e->getStatus());
        }
    }

    public function testSearchAllWalksPagesAndHonoursMax(): void
    {
        $api = $this->client(function (string $url): Response {
            parse_str((string) parse_url($url, PHP_URL_QUERY), $q);
            $n = (int) $q['page'];
            return self::ok(['page' => $n, 'pages' => 3, 'results' => [['id' => "{$n}a"], ['id' => "{$n}b"]]]);
        });
        $ids = array_column(iterator_to_array($api->searchAll('nurse'), false), 'id');
        $this->assertSame(['1a', '1b', '2a', '2b', '3a', '3b'], $ids);
        $this->assertSame(self::BASE . '/personas?q=nurse&page=1&limit=100', $this->calls[0]);

        $ids = array_column(iterator_to_array($api->searchAll(max: 3), false), 'id');
        $this->assertSame(['1a', '1b', '2a'], $ids);
    }

    public function testExportKinds(): void
    {
        $api = $this->client([self::ok("id,name\n1,A\n")]);
        $this->assertSame("id,name\n1,A\n", $api->export('random', 'csv', ['count' => 1]));
        $api->export('fixtures', 'ndjson', ['shape' => 'users']);
        $this->assertSame(self::BASE . '/personas/random?format=csv&count=1', $this->calls[0]);
        $this->assertSame(self::BASE . '/fixtures?format=ndjson&shape=users', $this->calls[1]);

        $this->expectException(\InvalidArgumentException::class);
        $api->export('nope', 'csv');
    }

    public function testFixturesTeamHouseholdsAndSheet(): void
    {
        $api = $this->client([self::ok([['email' => 'a@example.com']])]);
        $this->assertSame([['email' => 'a@example.com']], $api->fixtures('users', ['count' => 1, 'seed' => 1]));
        $api->team(['size' => 6, 'industry' => 'Healthcare']);
        $api->households(['count' => 2]);
        $this->assertSame(self::BASE . '/fixtures?shape=users&count=1&seed=1', $this->calls[0]);
        $this->assertSame(self::BASE . '/teams?size=6&industry=Healthcare', $this->calls[1]);
        $this->assertSame(self::BASE . '/households?count=2', $this->calls[2]);
        $this->assertSame(self::BASE . '/sheet.png?count=12&seed=1', $api->sheetUrl(['count' => 12, 'seed' => 1]));
    }

    public function testDefaultTransportAgainstLocalServer(): void
    {
        $port = random_int(20000, 40000);
        $dir = sys_get_temp_dir() . '/shq-php-' . $port;
        @mkdir($dir);
        file_put_contents($dir . '/router.php', '<?php
            if (str_starts_with($_SERVER["REQUEST_URI"], "/v1/stats")) { header("content-type: application/json"); echo json_encode(["total" => 9, "q" => $_GET]); return; }
            http_response_code(404); echo json_encode(["error" => "Nope"]);');
        $proc = proc_open([PHP_BINARY, '-S', "127.0.0.1:{$port}", $dir . '/router.php'], [1 => ['file', '/dev/null', 'w'], 2 => ['file', '/dev/null', 'w']], $pipes);
        try {
            $api = new Shaqsiyad("http://127.0.0.1:{$port}/v1", timeout: 5, retries: 0);
            for ($i = 0; $i < 50; $i++) {
                if (@fsockopen('127.0.0.1', $port)) {
                    break;
                }
                usleep(50_000);
            }
            $this->assertSame(9, $api->stats()['total']);
            try {
                $api->person('x');
                $this->fail('expected exception');
            } catch (ShaqsiyadException $e) {
                $this->assertSame([404, 'Nope'], [$e->getStatus(), $e->getApiMessage()]);
            }
        } finally {
            proc_terminate($proc);
            proc_close($proc);
            @unlink($dir . '/router.php');
            @rmdir($dir);
        }
    }
}
