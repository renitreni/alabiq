<?php

namespace Tests\Unit\Services;

use App\Services\AppSessionsService;
use Illuminate\Http\Request;
use Tests\UnitTestCase;

class AppSessionsServiceTest extends UnitTestCase
{
    protected AppSessionsService $sessions;

    protected function setUp(): void
    {
        parent::setUp();
        $this->sessions = new AppSessionsService;
    }

    public function test_hash_token_sha256(): void
    {
        $token = 'test-token-123';
        $hash = $this->sessions->hashToken($token);
        $this->assertEquals(hash('sha256', $token), $hash);
        $this->assertEquals(64, strlen($hash));
    }

    public function test_bearer_extracts_token(): void
    {
        $request = Request::create('/', 'GET', [], [], [], ['HTTP_AUTHORIZATION' => 'Bearer abc123']);
        $this->assertEquals('abc123', $this->sessions->bearer($request));
    }

    public function test_bearer_returns_null_when_missing(): void
    {
        $request = Request::create('/', 'GET');
        $this->assertNull($this->sessions->bearer($request));
    }

    public function test_bearer_returns_null_when_not_bearer(): void
    {
        $request = Request::create('/', 'GET', [], [], [], ['HTTP_AUTHORIZATION' => 'Basic abc123']);
        $this->assertNull($this->sessions->bearer($request));
    }
}
