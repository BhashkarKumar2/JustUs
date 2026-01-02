const BASE_URL = 'http://localhost:5000/api';

async function waitForServer() {
    console.log('⏳ Waiting for server to start...');
    for (let i = 0; i < 30; i++) {
        try {
            const res = await fetch(`${BASE_URL}/health`);
            if (res.ok) {
                console.log('✅ Server is up!');
                return;
            }
        } catch (e) {
            // Ignore error and retry
        }
        await new Promise(r => setTimeout(r, 1000));
    }
    throw new Error('Server failed to start in 30s');
}

async function runTests() {
    await waitForServer();
    console.log('🔒 Starting Security Verification Tests...\n');

    let passed = 0;
    let failed = 0;

    async function test(name, fn) {
        try {
            process.stdout.write(`Testing: ${name}... `);
            await fn();
            console.log('✅ PASS');
            passed++;
        } catch (error) {
            console.log('❌ FAIL');
            console.error(`   Error: ${error.message}`);
            failed++;
        }
    }

    // 1. Unauthenticated Access Test
    // Using /chat/messages which is a valid protected GET route
    await test('Protected Route (No Token)', async () => {
        const res = await fetch(`${BASE_URL}/chat/messages`);
        if (res.status !== 401) {
            throw new Error(`Expected 401 Unauthorized, got ${res.status}`);
        }
    });

    // 2. Invalid Token Test
    await test('Protected Route (Invalid Token)', async () => {
        const res = await fetch(`${BASE_URL}/chat/messages`, {
            headers: { 'Authorization': 'Bearer invalid-token-123' }
        });
        if (res.status !== 401 && res.status !== 403) {
            throw new Error(`Expected 401/403, got ${res.status}`);
        }
    });

    // 3. Security Headers Test
    await test('Security Headers (Helmet)', async () => {
        const res = await fetch(`${BASE_URL}/health`);

        const headers = {
            'content-security-policy': res.headers.get('content-security-policy'),
            'x-frame-options': res.headers.get('x-frame-options'),
            'x-content-type-options': res.headers.get('x-content-type-options'),
            'strict-transport-security': res.headers.get('strict-transport-security')
        };

        if (!headers['content-security-policy']) throw new Error('Missing Content-Security-Policy');
    });

    // 4. Unknown Route
    await test('Unknown Route Handling', async () => {
        const res = await fetch(`${BASE_URL}/unknown/route/test`);
        if (res.status !== 404) {
            throw new Error(`Expected 404 for unknown route, got ${res.status}`);
        }
    });

    // Summary
    console.log('\n📊 Test Summary');
    console.log('================');
    console.log(`Total:  ${passed + failed}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);

    if (failed > 0) process.exit(1);
}

runTests().catch(console.error);
