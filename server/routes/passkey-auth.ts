import { Router } from 'express';
import setupRouter from './passkey-setup.js';
import loginRouter from './passkey-login.js';
import registerRouter from './passkey-register.js';
import inviteRouter from './passkey-invite.js';

// Re-export shared config for any consumer that imported from passkey-auth
export { rpName, rpID, origin, setChallenge, getAndDeleteChallenge, deriveDeviceName, loginLimiter } from './passkey-shared.js';

const router = Router();

router.use(setupRouter);
router.use(loginRouter);
router.use(registerRouter);
router.use(inviteRouter);

export default router;
