const confirmAttempts = new Map<string, Promise<void>>();

const getAttemptKey = (tokenHash: string, type: string) => `${type}:${tokenHash}`;

export const getOrCreateConfirmAttempt = (
  tokenHash: string,
  type: string,
  createAttempt: () => Promise<void>
) => {
  const attemptKey = getAttemptKey(tokenHash, type);
  const existing = confirmAttempts.get(attemptKey);
  if (existing) {
    return existing;
  }

  const attempt = createAttempt();
  confirmAttempts.set(attemptKey, attempt);
  return attempt;
};

export const resetConfirmAttemptsForTests = () => {
  confirmAttempts.clear();
};
