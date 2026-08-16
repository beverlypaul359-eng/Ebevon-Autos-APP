const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

const config     = require('../config');
const { query }  = require('../db/pool');
const AppError   = require('../utils/AppError');

const { rpName, rpId, origin } = config.webauthn;

/* ══════════════════════════════════════════════
   REGISTRATION — Generate options
══════════════════════════════════════════════ */
const startRegistration = async (user) => {
  // Get existing passkeys to exclude
  const { rows: existing } = await query(
    `SELECT credential_id, transports FROM passkeys WHERE user_id=$1`, [user.id]
  );

  const options = await generateRegistrationOptions({
    rpName,
    rpID:     rpId,
    userID:   Buffer.from(user.id),
    userName: user.email || user.phone,
    userDisplayName: `${user.first_name} ${user.last_name}`,
    attestationType: 'none',
    excludeCredentials: existing.map((p) => ({
      id:         p.credential_id,
      transports: p.transports || [],
    })),
    authenticatorSelection: {
      residentKey:        'preferred',
      userVerification:   'preferred',
      authenticatorAttachment: 'platform',
    },
  });

  // Store challenge temporarily (expires in 5 min)
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  await query(
    `INSERT INTO webauthn_challenges (user_id, challenge, type, expires_at)
     VALUES ($1,$2,'registration',$3)`,
    [user.id, options.challenge, expiresAt]
  );

  return options;
};

/* ══════════════════════════════════════════════
   REGISTRATION — Verify response
══════════════════════════════════════════════ */
const finishRegistration = async (userId, body, friendlyName) => {
  const { rows } = await query(
    `SELECT * FROM webauthn_challenges
     WHERE user_id=$1 AND type='registration' AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  if (!rows.length) throw new AppError('Challenge expired. Please try again.', 400, 'CHALLENGE_EXPIRED');

  const challenge = rows[0];

  const verification = await verifyRegistrationResponse({
    response:            body,
    expectedChallenge:   challenge.challenge,
    expectedOrigin:      origin,
    expectedRPID:        rpId,
    requireUserVerification: false,
  });

  if (!verification.verified || !verification.registrationInfo)
    throw new AppError('Passkey registration failed', 400, 'WEBAUTHN_FAILED');

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

  // Save the passkey
  await query(
    `INSERT INTO passkeys
       (user_id, credential_id, public_key, counter, device_type, backed_up, transports, friendly_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      userId,
      Buffer.from(credential.id).toString('base64url'),
      Buffer.from(credential.publicKey).toString('base64'),
      credential.counter,
      credentialDeviceType,
      credentialBackedUp,
      body.response?.transports || [],
      friendlyName || 'My Device',
    ]
  );

  await query(`UPDATE users SET passkey_registered=TRUE, updated_at=NOW() WHERE id=$1`, [userId]);

  // Clean up challenge
  await query(`DELETE FROM webauthn_challenges WHERE id=$1`, [challenge.id]);
  return true;
};

/* ══════════════════════════════════════════════
   AUTHENTICATION — Generate options
══════════════════════════════════════════════ */
const startAuthentication = async (identifier) => {
  // Find user
  const { rows: userRows } = await query(
    `SELECT * FROM users WHERE email=$1 OR phone=$1 LIMIT 1`, [identifier]
  );
  if (!userRows.length) throw new AppError('User not found', 404);
  const user = userRows[0];

  const { rows: passkeys } = await query(
    `SELECT * FROM passkeys WHERE user_id=$1`, [user.id]
  );
  if (!passkeys.length) throw new AppError('No passkeys registered for this account', 400, 'NO_PASSKEYS');

  const options = await generateAuthenticationOptions({
    rpID:              rpId,
    userVerification:  'preferred',
    allowCredentials:  passkeys.map((p) => ({
      id:         p.credential_id,
      transports: p.transports || [],
    })),
  });

  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  await query(
    `INSERT INTO webauthn_challenges (user_id, challenge, type, expires_at)
     VALUES ($1,$2,'authentication',$3)`,
    [user.id, options.challenge, expiresAt]
  );

  return { options, userId: user.id };
};

/* ══════════════════════════════════════════════
   AUTHENTICATION — Verify response
══════════════════════════════════════════════ */
const finishAuthentication = async (userId, body) => {
  const credId = body.id;

  const { rows: pkRows } = await query(
    `SELECT * FROM passkeys WHERE user_id=$1 AND credential_id=$2`, [userId, credId]
  );
  if (!pkRows.length) throw new AppError('Passkey not found', 400);
  const passkey = pkRows[0];

  const { rows: chalRows } = await query(
    `SELECT * FROM webauthn_challenges
     WHERE user_id=$1 AND type='authentication' AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  if (!chalRows.length) throw new AppError('Challenge expired', 400, 'CHALLENGE_EXPIRED');

  const verification = await verifyAuthenticationResponse({
    response:                body,
    expectedChallenge:       chalRows[0].challenge,
    expectedOrigin:          origin,
    expectedRPID:            rpId,
    credential: {
      id:        passkey.credential_id,
      publicKey: Buffer.from(passkey.public_key, 'base64'),
      counter:   Number(passkey.counter),
      transports: passkey.transports,
    },
    requireUserVerification: false,
  });

  if (!verification.verified) throw new AppError('Passkey authentication failed', 401, 'WEBAUTHN_FAILED');

  // Update counter
  await query(
    `UPDATE passkeys SET counter=$1, last_used_at=NOW() WHERE id=$2`,
    [verification.authenticationInfo.newCounter, passkey.id]
  );
  await query(`DELETE FROM webauthn_challenges WHERE id=$1`, [chalRows[0].id]);
  await query(`UPDATE users SET last_login_at=NOW() WHERE id=$1`, [userId]);

  return true;
};

module.exports = { startRegistration, finishRegistration, startAuthentication, finishAuthentication };
