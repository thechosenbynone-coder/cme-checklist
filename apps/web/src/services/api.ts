import { Inspecao, Equipamento, Material, ChecklistModelo, User } from '@cme/types';

const TOKEN_KEY = 'cme_token';
const USER_KEY = 'cme_current_user';

const getApiUrl = (path: string) => {
  const baseUrl = import.meta.env.VITE_API_BASE_URL || '';
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}/api${cleanPath}`;
};

// ── Sessão (token + usuário) em localStorage ───────────────────────
const getToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
};

const setSession = (token: string, user: User): void => {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
};

const clearSession = (): void => {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
};

// ── HTTP helper (injeta Authorization) ─────────────────────────────
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = getApiUrl(path);
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    // Sessão expirada/inválida: limpa e força novo login.
    clearSession();
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.assign('/login');
    }
    throw new Error('Não autenticado.');
  }

  if (!response.ok) {
    let msg = response.statusText;
    try {
      const body = await response.json();
      if (body?.error) msg = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg || 'Erro na chamada da API.');
  }

  if (response.status === 204) return null as unknown as T;
  return response.json();
}

const api = {
  equipamentos: {
    list: (busca?: string): Promise<Equipamento[]> =>
      request<Equipamento[]>(`/equipamentos${busca ? `?busca=${encodeURIComponent(busca)}` : ''}`),
    get: (id: string): Promise<Equipamento> =>
      request<Equipamento>(`/equipamentos/${encodeURIComponent(id)}`),
  },
  modelos: {
    list: (): Promise<ChecklistModelo[]> => request<ChecklistModelo[]>('/modelos'),
    get: (id: string): Promise<ChecklistModelo> =>
      request<ChecklistModelo>(`/modelos/${encodeURIComponent(id)}`),
    getPorTipo: (tipo: string): Promise<ChecklistModelo | undefined> =>
      request<ChecklistModelo>(`/modelos/tipo/${encodeURIComponent(tipo)}`),
    // Salvar = cria nova versão (ISO 9001).
    save: (modelo: { nome: string; tipoEquipamento: string; itens: any[] }): Promise<ChecklistModelo> =>
      request<ChecklistModelo>('/modelos', { method: 'POST', body: JSON.stringify(modelo) }),
  },
  materiais: {
    list: (): Promise<Material[]> => request<Material[]>('/materiais'),
  },
  inspecoes: {
    list: (): Promise<Inspecao[]> => request<Inspecao[]>('/inspecoes'),
    get: (id: string): Promise<Inspecao | undefined> => request<Inspecao>(`/inspecoes/${id}`),
    save: async (inspecao: Inspecao): Promise<void> => {
      await request<void>('/inspecoes', { method: 'POST', body: JSON.stringify(inspecao) });
    },
  },
  auth: {
    login: async (identifier: string, senha: string): Promise<User> => {
      const baseUrl = import.meta.env.VITE_API_BASE_URL || '';
      const response = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, senha }),
      });
      if (!response.ok) {
        let msg = 'Credenciais inválidas.';
        try {
          const body = await response.json();
          if (body?.error) msg = body.error;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      const data = (await response.json()) as { token: string; user: User };
      setSession(data.token, data.user);
      return data.user;
    },
    currentUser: (): User | null => {
      if (typeof window === 'undefined') return null;
      const raw = window.localStorage.getItem(USER_KEY);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as User;
      } catch {
        return null;
      }
    },
    isAuthenticated: (): boolean => !!getToken(),
    logout: (): void => clearSession(),
    listUsers: (): Promise<User[]> => request<User[]>('/users'),
  },
  upload: {
    file: async (file: File | Blob, filename: string): Promise<string> => {
      const formData = new FormData();
      formData.append('file', file, filename);
      const baseUrl = import.meta.env.VITE_API_BASE_URL || '';
      const token = getToken();
      const response = await fetch(`${baseUrl}/api/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      });
      if (!response.ok) throw new Error('Falha no upload');
      const data = await response.json();
      return data.url as string;
    },
  },
  // Converte URL de mídia do Drive (proxy autenticado) anexando o token para uso em <img>/<video>.
  mediaUrl: (url?: string): string | undefined => {
    if (!url) return url;
    if (url.startsWith('/api/files/')) {
      const token = getToken();
      const base = import.meta.env.VITE_API_BASE_URL || '';
      return `${base}${url}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    }
    return url;
  },
};

export default api;