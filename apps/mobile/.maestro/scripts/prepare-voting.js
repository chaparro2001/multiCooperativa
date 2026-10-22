/* global http, output, API_URL, ADMIN_EMAIL, PASSWORD, COOPERATIVE_NAME */
// Prepares state through the API so the flow can focus on the member's journey: an admin
// creates an assembly, convenes it and opens the voting of its only point.
// Exposes output.assemblyId. Runs in Maestro's JS runtime (global `http`, env vars as globals).
function call(method, path, token, body) {
  var headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  var options = { headers: headers };
  // Maestro's http rejects a POST without a body and a GET with one.
  if (method !== 'GET') options.body = JSON.stringify(body === undefined ? {} : body);
  var response =
    method === 'GET' ? http.get(API_URL + path, options) : http.post(API_URL + path, options);
  if (!response.ok) {
    throw new Error(method + ' ' + path + ' -> ' + response.status + ' ' + response.body);
  }
  return response.body ? JSON.parse(response.body) : null;
}

var tokens = call('POST', '/auth/login', null, { email: ADMIN_EMAIL, password: PASSWORD });
var me = call('GET', '/me', tokens.accessToken);
var membership = me.memberships.filter(function (m) {
  return m.cooperativeName === COOPERATIVE_NAME;
})[0];
var base = '/cooperatives/' + membership.cooperativeId;

// 20 days ahead: past the default minimum notice of 15 days (BR-ASM-09).
var firstCall = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString();
var assembly = call('POST', base + '/assemblies', tokens.accessToken, {
  type: 'ordinary',
  firstCallAt: firstCall,
  secondCallAt: null,
  place: 'Salon E2E ' + Date.now(),
  points: [
    { title: 'Aprobar las cuentas E2E', description: '', votable: true, majority: 'simple' },
  ],
});
call('POST', base + '/assemblies/' + assembly.id + '/convene', tokens.accessToken);
var detail = call('GET', base + '/assemblies/' + assembly.id, tokens.accessToken);
call('POST', base + '/points/' + detail.points[0].id + '/voting/open', tokens.accessToken);

output.assemblyId = assembly.id;
