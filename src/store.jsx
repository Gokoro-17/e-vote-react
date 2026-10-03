import { createContext, useContext, useEffect, useState } from "react";
const Context = createContext();
let csrf = null;
export class HttpError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}
export async function api(path, body, method = body ? "POST" : "GET") {
  let response;
  try {
    response = await fetch("/api" + path, {
      method,
      credentials: "include",
      headers: {
        ...(body instanceof FormData
          ? {}
          : { "content-type": "application/json" }),
        ...(csrf ? { "x-csrf-token": csrf } : {}),
      },
      body: body
        ? body instanceof FormData
          ? body
          : JSON.stringify(body)
        : undefined,
    });
  } catch {
    throw new HttpError(
      "We couldn’t connect. Check your connection and try again.",
      0,
    );
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new HttpError(
      data.error ||
        "This service is temporarily unavailable. Please try again.",
      response.status,
    );
  if (Object.hasOwn(data, "csrf")) csrf = data.csrf;
  return data;
}
export function StoreProvider({ children }) {
  const [user, setUser] = useState(null),
    [needsMfa, setMfa] = useState(false),
    [configured, setConfigured] = useState(true),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const refresh = async () => {
    try {
      const data = await api("/auth/session");
      setUser(data.user);
      setMfa(data.needsMfa);
      setConfigured(data.configured);
      setError("");
      return data;
    } catch (e) {
      csrf = null;
      setError(e.message);
      setUser(null);
      setMfa(false);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    refresh();
  }, []);
  const auth = async (path, data) => {
    const result = await api("/auth/" + path, data);
    if (Object.hasOwn(result, "user")) setUser(result.user);
    if (Object.hasOwn(result, "needsMfa")) setMfa(result.needsMfa);
    return result;
  };
  const logout = async () => {
    try {
      await api("/auth/logout", {});
    } catch (e) {
      await refresh();
      throw e;
    }
    csrf = null;
    setUser(null);
    setMfa(false);
  };
  return (
    <Context.Provider
      value={{
        user,
        needsMfa,
        configured,
        loading,
        error,
        refresh,
        auth,
        logout,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useStore = () => useContext(Context);
