<?php

namespace App\Exceptions;

use Illuminate\Foundation\Exceptions\Handler as ExceptionHandler;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Throwable;
use Illuminate\Validation\ValidationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Auth\Access\AuthorizationException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\HttpKernel\Exception\MethodNotAllowedHttpException;
use Symfony\Component\HttpKernel\Exception\TooManyRequestsHttpException;

class Handler extends ExceptionHandler
{
    /**
     * A list of exception types with their corresponding custom log levels.
     *
     * @var array<class-string<\Throwable>, \Psr\Log\LogLevel::*>
     */
    protected $levels = [
        //
    ];

    /**
     * A list of the exception types that are not reported.
     *
     * @var array<int, class-string<\Throwable>>
     */
    protected $dontReport = [
        //
    ];

    /**
     * A list of the inputs that are never flashed to the session on validation exceptions.
     *
     * @var array<int, string>
     */
    protected $dontFlash = [
        'current_password',
        'password',
        'password_confirmation',
    ];

    /**
     * Register the exception handling callbacks for the application.
     */
    public function register(): void
    {
        $this->reportable(function (Throwable $e) {
            // Log the full stack trace internally
            logger()->error('Unhandled exception', [
                'exception' => get_class($e),
                'message' => $e->getMessage(),
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'trace' => $e->getTraceAsString(),
            ]);
        });

        $this->renderable(function (ValidationException $e, Request $request) {
            return response()->json([
                'error' => 'Validation failed',
                'details' => $e->errors(),
            ], 400);
        });

        $this->renderable(function (AuthenticationException $e, Request $request) {
            return response()->json(['error' => 'Authentication required'], 401);
        });

        $this->renderable(function (AuthorizationException $e, Request $request) {
            return response()->json(['error' => 'Access denied'], 403);
        });

        $this->renderable(function (NotFoundHttpException $e, Request $request) {
            return response()->json(['error' => 'Not found'], 404);
        });

        $this->renderable(function (MethodNotAllowedHttpException $e, Request $request) {
            return response()->json(['error' => 'Method not allowed'], 405);
        });

        $this->renderable(function (TooManyRequestsHttpException $e, Request $request) {
            return response()->json(['error' => 'Too many requests. Please try again later.'], 429);
        });

        // Catch-all for any other exceptions
        $this->renderable(function (Throwable $e, Request $request) {
            // In production, never leak stack traces or internal errors
            return response()->json(['error' => 'Unexpected server error'], 500);
        });
    }
}