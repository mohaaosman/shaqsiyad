<?php

declare(strict_types=1);

namespace Shaqsiyad;

/**
 * Client for the Shaqsiyad API.
 *
 * Filters (camelCase or snake_case): q, gender, minAge, maxAge, continent, country, ethnicity,
 * religion, tier, mbti, relationship, industry, status. Same seed + same filters → same people.
 */
final class Shaqsiyad
{
    public const VERSION = '0.1.0';
    public const DEFAULT_BASE_URL = 'https://shaqsiyad.example/api/v1';

    private const EXPORT_PATHS = ['personas' => '/personas', 'random' => '/personas/random', 'fixtures' => '/fixtures'];

    public readonly string $baseUrl;

    /** @var callable(string, float): Response */
    private $transport;

    /** @var callable(float): void */
    private $sleep;

    /**
     * @param callable(string $url, float $timeout): Response|null $transport Custom HTTP GET, e.g. for tests.
     * @param callable(float $seconds): void|null $sleep Used between retries.
     */
    public function __construct(
        ?string $baseUrl = null,
        public readonly float $timeout = 30.0,
        public readonly int $retries = 1,
        ?callable $transport = null,
        ?callable $sleep = null,
    ) {
        $env = getenv('SHAQSIYAD_BASE_URL');
        $this->baseUrl = rtrim($baseUrl ?? ($env !== false && $env !== '' ? $env : self::DEFAULT_BASE_URL), '/');
        $this->transport = $transport ?? self::defaultTransport(...);
        $this->sleep = $sleep ?? static fn (float $s) => usleep((int) round($s * 1_000_000));
    }

    /** @param array<string, mixed> $query */
    public function url(string $path, array $query = []): string
    {
        $pairs = [];
        foreach ($query as $key => $value) {
            $key = lcfirst(str_replace('_', '', ucwords((string) $key, '_')));
            foreach (is_array($value) ? $value : [$value] as $item) {
                if ($item === null || $item === '') {
                    continue;
                }
                $pairs[] = rawurlencode($key) . '=' . rawurlencode(is_bool($item) ? ($item ? 'true' : 'false') : (string) $item);
            }
        }
        return $this->baseUrl . $path . ($pairs ? '?' . implode('&', $pairs) : '');
    }

    /** @param array<string, mixed> $query */
    private function get(string $path, array $query = []): string
    {
        for ($attempt = 0; ; $attempt++) {
            try {
                $res = ($this->transport)($this->url($path, $query), $this->timeout);
            } catch (ShaqsiyadException $e) {
                throw $e;
            } catch (\Throwable $e) {
                throw new ShaqsiyadException(0, $e->getMessage());
            }
            if (($res->status === 429 || $res->status >= 500) && $attempt < $this->retries) {
                $after = $res->headers['retry-after'] ?? '';
                ($this->sleep)(is_numeric($after) && (float) $after >= 0 ? (float) $after : 2 ** $attempt);
                continue;
            }
            if ($res->status < 200 || $res->status >= 300) {
                $body = json_decode($res->body, true);
                $message = is_array($body) && isset($body['error']) ? (string) $body['error'] : self::reason($res->status);
                throw new ShaqsiyadException($res->status, $message);
            }
            return $res->body;
        }
    }

    /** @param array<string, mixed> $query */
    private function json(string $path, array $query = []): mixed
    {
        try {
            return json_decode($this->get($path, $query), true, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException $e) {
            throw new ShaqsiyadException(0, 'Bad JSON: ' . $e->getMessage());
        }
    }

    /** @param array<string, mixed> $params */
    public function search(?string $q = null, array $params = []): array
    {
        return $this->json('/personas', ['q' => $q] + $params);
    }

    /**
     * Every match across all pages, one summary at a time. Stops after $max people if given.
     *
     * @param array<string, mixed> $params
     * @return \Generator<int, array<string, mixed>>
     */
    public function searchAll(?string $q = null, array $params = [], ?int $max = null): \Generator
    {
        $params += ['limit' => 100];
        $yielded = 0;
        for ($page = 1; ; $page++) {
            $result = $this->search($q, ['page' => $page] + $params);
            foreach ($result['results'] ?? [] as $person) {
                if ($max !== null && $yielded >= $max) {
                    return;
                }
                $yielded++;
                yield $person;
            }
            if ($page >= ($result['pages'] ?? 0) || empty($result['results'])) {
                return;
            }
        }
    }

    /** @param array<string, mixed> $params */
    public function random(int $count = 5, array $params = []): array
    {
        return $this->json('/personas/random', ['count' => $count] + $params);
    }

    /** @param list<string>|null $fields */
    public function person(string $idOrSlug, ?array $fields = null): array
    {
        return $this->json('/personas/' . rawurlencode($idOrSlug), ['fields' => $fields ? implode(',', $fields) : null]);
    }

    public function graph(string $idOrSlug, int $depth = 1): array
    {
        return $this->json('/personas/' . rawurlencode($idOrSlug) . '/graph', ['depth' => $depth]);
    }

    /** @param array<string, mixed> $params */
    public function fixtures(string $shape, array $params = []): array
    {
        return $this->json('/fixtures', ['shape' => $shape] + $params);
    }

    /**
     * Raw CSV or NDJSON for 'personas' (a search), 'random' or 'fixtures'.
     *
     * @param array<string, mixed> $params
     */
    public function export(string $kind, string $format, array $params = []): string
    {
        if (!isset(self::EXPORT_PATHS[$kind])) {
            throw new \InvalidArgumentException('kind must be personas, random or fixtures');
        }
        if (!in_array($format, ['csv', 'ndjson'], true)) {
            throw new \InvalidArgumentException('format must be csv or ndjson');
        }
        return $this->get(self::EXPORT_PATHS[$kind], ['format' => $format] + $params);
    }

    /** @param array<string, mixed> $params */
    public function households(array $params = []): array
    {
        return $this->json('/households', $params);
    }

    /** @param array<string, mixed> $params size, industry, seed */
    public function team(array $params = []): array
    {
        return $this->json('/teams', $params);
    }

    public function stats(): array
    {
        return $this->json('/stats');
    }

    public function avatarUrl(string $idOrSlug, ?int $size = null, ?string $format = null): string
    {
        return $this->url('/personas/' . rawurlencode($idOrSlug) . '/avatar', ['size' => $size, 'format' => $format]);
    }

    /** @param array<string, mixed> $params */
    public function sheetUrl(array $params = []): string
    {
        return $this->url('/sheet.png', $params);
    }

    private static function defaultTransport(string $url, float $timeout): Response
    {
        $userAgent = 'shaqsiyad-php/' . self::VERSION;
        if (function_exists('curl_init')) {
            $headers = [];
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_TIMEOUT_MS => (int) ($timeout * 1000),
                CURLOPT_USERAGENT => $userAgent,
                CURLOPT_HEADERFUNCTION => static function ($ch, string $line) use (&$headers): int {
                    if (str_contains($line, ':')) {
                        [$name, $value] = explode(':', $line, 2);
                        $headers[strtolower(trim($name))] = trim($value);
                    }
                    return strlen($line);
                },
            ]);
            $body = curl_exec($ch);
            if ($body === false) {
                $error = curl_error($ch);
                curl_close($ch);
                throw new ShaqsiyadException(0, $error);
            }
            $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            curl_close($ch);
            return new Response($status, (string) $body, $headers);
        }

        $context = stream_context_create(['http' => ['timeout' => $timeout, 'ignore_errors' => true, 'user_agent' => $userAgent]]);
        $body = @file_get_contents($url, false, $context);
        if ($body === false) {
            throw new ShaqsiyadException(0, error_get_last()['message'] ?? 'Request failed');
        }
        $status = 0;
        $headers = [];
        foreach ($http_response_header ?? [] as $line) {
            if (preg_match('#^HTTP/\S+\s+(\d{3})#', $line, $m)) {
                $status = (int) $m[1];
                $headers = [];
            } elseif (str_contains($line, ':')) {
                [$name, $value] = explode(':', $line, 2);
                $headers[strtolower(trim($name))] = trim($value);
            }
        }
        return new Response($status, $body, $headers);
    }

    private static function reason(int $status): string
    {
        return [400 => 'Bad Request', 404 => 'Not Found', 429 => 'Too Many Requests', 500 => 'Internal Server Error', 503 => 'Service Unavailable'][$status] ?? 'HTTP error';
    }
}
