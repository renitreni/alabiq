<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Tap Payments service (Laravel port of backend/lib/tap.js).
 *
 * Phase C minimal port: pure helpers implemented with Node parity;
 * HTTP-calling operations are stubs until Phase C completion.
 */
class TapService
{
    protected string $secretKey;
    protected string $publicKey;
    protected string $merchantId;
    protected string $apiBase;

    public function __construct()
    {
        $config = config('services.tap', []);
        $this->secretKey = $config['secret_key'] ?? '';
        $this->publicKey = $config['public_key'] ?? '';
        $this->merchantId = $config['merchant_id'] ?? '';
        $this->apiBase = rtrim($config['api_base'] ?? 'https://api.tap.company', '/');
    }

    /**
     * Whether Tap is configured with a secret key.
     */
    public function tapConfigured(): bool
    {
        return $this->secretKey !== '';
    }

    /**
     * Format amount in the smallest currency unit (halala), matching Node formatAmount.
     */
    public function formatAmount(float $amount, string $currency = 'SAR'): int
    {
        return (int) round($amount * 100);
    }

    /**
     * Build the HMAC hash string for webhook verification (Node parity: buildHashString).
     */
    public function buildHashString(array $body): string
    {
        $amount = $body['amount'] ?? '';
        $currency = $body['currency'] ?? '';
        $status = $body['status'] ?? '';
        $id = $body['id'] ?? '';
        $created = $body['created'] ?? '';

        return "x_id{$id}x_amount{$amount}x_currency{$currency}x_status{$status}x_created{$created}";
    }

    /**
     * Verify a Tap webhook hash (Node parity: verifyWebhookHash).
     */
    public function verifyWebhookHash(array $body, string $postedHashString): bool
    {
        if ($this->secretKey === '') {
            return false;
        }

        $computed = hash_hmac('sha256', $this->buildHashString($body), $this->secretKey);

        return hash_equals($computed, strtolower($postedHashString));
    }

    /**
     * Execute a signed request against the Tap API.
     */
    protected function tapRequest(string $path, string $method = 'GET', ?array $body = null): array
    {
        if (! $this->tapConfigured()) {
            throw new RuntimeException('Tap Payments is not configured');
        }

        $response = Http::withHeaders([
            'Authorization' => 'Bearer '.$this->secretKey,
            'Content-Type' => 'application/json',
        ])->send($method, $this->apiBase.$path, ['json' => $body]);

        if ($response->failed()) {
            Log::warning('Tap API request failed', [
                'path' => $path,
                'status' => $response->status(),
                'body' => $response->body(),
            ]);
            throw new RuntimeException('Tap API request failed: '.$response->status());
        }

        return $response->json() ?? [];
    }

    public function fetchCharge(string $chargeId): array
    {
        return $this->tapRequest('/v2/charges/'.urlencode($chargeId));
    }

    public function createCustomer(array $profile): array
    {
        return $this->tapRequest('/v2/customers', 'POST', [
            'first_name' => $profile['first_name'] ?? null,
            'last_name' => $profile['last_name'] ?? null,
            'email' => $profile['email'] ?? null,
            'phone' => $profile['phone'] ?? null,
            'metadata' => ['profile_id' => $profile['id'] ?? null],
        ]);
    }

    // --- Stubs: implemented in Phase C ---

    public function mintSavedCardToken(array $params): array
    {
        throw new RuntimeException('TapService::mintSavedCardToken not yet implemented (Phase C)');
    }

    public function listCards(string $customerId): array
    {
        throw new RuntimeException('TapService::listCards not yet implemented (Phase C)');
    }

    public function deleteCard(string $customerId, string $cardId): array
    {
        throw new RuntimeException('TapService::deleteCard not yet implemented (Phase C)');
    }

    public function createCharge(array $params): array
    {
        throw new RuntimeException('TapService::createCharge not yet implemented (Phase C)');
    }
}
