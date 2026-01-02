const BASE_URL = 'http://localhost:5000/api';
const CONCURRENT_REQUESTS = 100;

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

async function runTest() {
    await waitForServer();
    console.log(`🚀 Starting Scalability Test (${CONCURRENT_REQUESTS} concurrent requests)...\n`);

    const start = performance.now();

    const requests = Array.from({ length: CONCURRENT_REQUESTS }, async (_, i) => {
        try {
            const reqStart = performance.now();
            const res = await fetch(`${BASE_URL}/health`);
            const reqEnd = performance.now();
            return { ok: res.ok, status: res.status, latency: reqEnd - reqStart };
        } catch (e) {
            return { ok: false, error: e.message, latency: 0 };
        }
    });

    const results = await Promise.all(requests);
    const end = performance.now();
    const duration = (end - start) / 1000; // seconds

    const passed = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok).length;
    const avgLatency = results.reduce((acc, r) => acc + r.latency, 0) / results.length;

    console.log('\n📊 Scalability Results');
    console.log('======================');
    console.log(`Total Requests:  ${CONCURRENT_REQUESTS}`);
    console.log(`Time Taken:      ${duration.toFixed(2)}s`);
    console.log(`Throughput:      ${(CONCURRENT_REQUESTS / duration).toFixed(2)} req/sec`);
    console.log(`Avg Latency:     ${avgLatency.toFixed(2)}ms`);
    console.log(`Successful:      ${passed}`);
    console.log(`Failed:          ${failed}`);

    if (failed > 0) process.exit(1);
}

runTest().catch(console.error);
