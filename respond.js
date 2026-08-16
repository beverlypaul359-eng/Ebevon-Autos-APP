/** Standard JSON response helpers */
const ok = (res, data = {}, message = 'Success', statusCode = 200) =>
  res.status(statusCode).json({ success: true, message, data });

const created = (res, data = {}, message = 'Created') =>
  ok(res, data, message, 201);

const fail = (res, message = 'Error', statusCode = 400, code = null) =>
  res.status(statusCode).json({ success: false, message, code });

module.exports = { ok, created, fail };
