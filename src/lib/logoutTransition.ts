interface LocalAuth {
  signOut: (options: { scope: 'local' }) => Promise<{ error: unknown }>;
}

export async function logoutWithTransition(
  auth: LocalAuth,
  delay = 450,
  wait = (milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds)),
) {
  await wait(delay);
  const { error } = await auth.signOut({ scope: 'local' });
  if (error) throw error;
}
