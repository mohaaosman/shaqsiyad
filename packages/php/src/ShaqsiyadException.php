<?php

declare(strict_types=1);

namespace Shaqsiyad;

/** An API or network error. getStatus() is the HTTP status, or 0 for network errors and timeouts. */
final class ShaqsiyadException extends \RuntimeException
{
    public function __construct(private readonly int $status, string $message)
    {
        parent::__construct($status ? "{$status}: {$message}" : $message, $status);
    }

    public function getStatus(): int
    {
        return $this->status;
    }

    public function getApiMessage(): string
    {
        $prefix = $this->status ? "{$this->status}: " : '';
        return substr($this->getMessage(), strlen($prefix));
    }
}
