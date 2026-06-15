const http = require('http');

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };
    if (token) {
      options.headers['Authorization'] = 'Bearer ' + token;
    }
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ raw: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  // Login
  console.log('=== Login ===');
  const loginResult = await request('POST', '/api/auth/login', { email: 'admin@novacoin.io', password: 'Admin@123456' });
  console.log(JSON.stringify(loginResult, null, 2));
  
  if (loginResult.token) {
    // Get users
    console.log('\n=== Get Users ===');
    const usersResult = await request('GET', '/api/admin/users', null, loginResult.token);
    console.log(JSON.stringify(usersResult, null, 2));
  }
}

main().catch(console.error);
