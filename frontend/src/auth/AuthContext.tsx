import {
  confirmSignIn,
  fetchAuthSession,
  getCurrentUser,
  signIn,
  signOut,
} from "aws-amplify/auth";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface AuthContextValue {
  readonly status: "loading" | "authenticated" | "anonymous";
  readonly username: string | null;
  readonly needsNewPassword: boolean;
  signIn(username: string, password: string): Promise<void>;
  confirmNewPassword(password: string): Promise<void>;
  signOut(): Promise<void>;
  accessToken(): Promise<string>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [status, setStatus] =
    useState<AuthContextValue["status"]>("loading");
  const [username, setUsername] = useState<string | null>(null);
  const [needsNewPassword, setNeedsNewPassword] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const user = await getCurrentUser();
      setUsername(user.username);
      setStatus("authenticated");
    } catch {
      setUsername(null);
      setStatus("anonymous");
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void refresh());
  }, [refresh]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      username,
      needsNewPassword,
      async signIn(loginUsername, password) {
        const result = await signIn({
          username: loginUsername,
          password,
        });
        if (
          result.nextStep.signInStep ===
          "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED"
        ) {
          setNeedsNewPassword(true);
          setUsername(loginUsername);
          return;
        }
        setNeedsNewPassword(false);
        await refresh();
      },
      async confirmNewPassword(password) {
        await confirmSignIn({
          challengeResponse: password,
        });
        setNeedsNewPassword(false);
        await refresh();
      },
      async signOut() {
        await signOut();
        setUsername(null);
        setStatus("anonymous");
      },
      async accessToken() {
        const session = await fetchAuthSession();
        const token = session.tokens?.accessToken.toString();
        if (!token) {
          throw new Error("アクセストークンを取得できません。");
        }
        return token;
      },
    }),
    [needsNewPassword, refresh, status, username],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ContextとProviderを同じモジュールに閉じ、認証APIを一箇所に保つ。
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === null) {
    throw new Error("AuthProviderの内側でuseAuthを使用してください。");
  }
  return value;
}
