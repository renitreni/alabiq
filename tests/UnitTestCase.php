<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class UnitTestCase extends BaseTestCase
{
    // Unit tests don't use RefreshDatabase - they test pure logic without database
    protected function setUp(): void
    {
        parent::setUp();
    }
}