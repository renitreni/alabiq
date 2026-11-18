<?php

namespace Tests\Feature\Services;

use App\Models\AppSession;
use App\Models\AppUser;
use App\Services\AppSessionsService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Tests\FeatureTestCase;

class AppSessionsServiceTest extends FeatureTestCase
{
    protected AppSessionsService $sessions;

    protected function setUp(): void
    {
        parent::setUp();
        $this->sessions = new AppSessionsService;
    }

    public function test_create_session_returns_token_and_user(): void
    {
        $user = AppUser::factory()->create([
            'email' => 'test@example.com',
            'password_hash' => Hash::make('password'),
        ]);

        $request = Request::create('/', 'POST', [], [], [], [
            'HTTP_USER_AGENT' => 'TestAgent',
            'REMOTE_ADDR' => '127.0.0.1',
        ]);

        $result = $this->sessions->createSession($user, $request);

        $this->assertArrayHasKey('token', $result);
        $this->assertArrayHasKey('user', $result);
        $this->assertEquals($user->id, $result['user']['id']);
        $this->assertEquals($user->email, $result['user']['email']);

        $session = AppSession::where('user_id', $user->id)->first();
        $this->assertNotNull($session);
        $this->assertEquals($this->sessions->hashToken($result['token']), $session->token_hash);
        $this->assertNull($session->revoked_at);
    }

    public function test_find_session_valid(): void
    {
        $user = AppUser::factory()->create([
            'email' => 'test@example.com',
            'password_hash' => Hash::make('password'),
        ]);

        $request = Request::create('/', 'POST', [], [], [], [
            'HTTP_USER_AGENT' => 'TestAgent',
            'REMOTE_ADDR' => '127.0.0.1',
        ]);

        $created = $this->sessions->createSession($user, $request);

        $findRequest = Request::create('/', 'GET', [], [], [], ['HTTP_AUTHORIZATION' => 'Bearer '.$created['token']]);
        $session = $this->sessions->findSession($findRequest);

        $this->assertNotNull($session);
        $this->assertEquals($user->id, $session->user_id);
    }

    public function test_find_session_invalid_token(): void
    {
        $request = Request::create('/', 'GET', [], [], [], ['HTTP_AUTHORIZATION' => 'Bearer invalid-token']);
        $session = $this->sessions->findSession($request);
        $this->assertNull($session);
    }

    public function test_find_session_revoked(): void
    {
        $user = AppUser::factory()->create([
            'email' => 'test@example.com',
            'password_hash' => Hash::make('password'),
        ]);

        $request = Request::create('/', 'POST', [], [], [], [
            'HTTP_USER_AGENT' => 'TestAgent',
            'REMOTE_ADDR' => '127.0.0.1',
        ]);

        $created = $this->sessions->createSession($user, $request);

        $this->sessions->revokeSession(Request::create('/', 'GET', [], [], [], ['HTTP_AUTHORIZATION' => 'Bearer '.$created['token']]));

        $findRequest = Request::create('/', 'GET', [], [], [], ['HTTP_AUTHORIZATION' => 'Bearer '.$created['token']]);
        $session = $this->sessions->findSession($findRequest);

        $this->assertNull($session);
    }

    public function test_find_session_disabled_user(): void
    {
        $user = AppUser::factory()->create([
            'email' => 'test@example.com',
            'password_hash' => Hash::make('password'),
            'disabled_at' => now(),
        ]);

        $request = Request::create('/', 'POST', [], [], [], [
            'HTTP_USER_AGENT' => 'TestAgent',
            'REMOTE_ADDR' => '127.0.0.1',
        ]);

        $created = $this->sessions->createSession($user, $request);

        $findRequest = Request::create('/', 'GET', [], [], [], ['HTTP_AUTHORIZATION' => 'Bearer '.$created['token']]);
        $session = $this->sessions->findSession($findRequest);

        $this->assertNull($session);
    }
}
