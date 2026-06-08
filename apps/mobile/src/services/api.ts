import * as mockDb from './mockData';
import { Inspecao, Equipamento, Material, ChecklistModelo, User } from '@cme/types';

const isMockMode = () => {
  const mockEnv = import.meta.env.VITE_MOCK_MODE;
  if (mockEnv === 'false') return false;
  return true;
};

const getApiUrl = (path: string) => {
  const baseUrl = import.meta.env.VITE_API_BASE_URL || '';
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}/api${cleanPath}`;
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = getApiUrl(path);
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new Error(`Erro na chamada da API: ${response.statusText}`);
  }

  if (response.status === 204) return null as unknown as T;
  return response.json();
}

const api = {
  equipamentos: {
    list: async (): Promise<Equipamento[]> => {
      if (isMockMode()) return mockDb.getEquipamentos();
      return request<Equipamento[]>('/equipamentos');
    }
  },
  modelos: {
    getPorTipo: async (tipo: string): Promise<ChecklistModelo | undefined> => {
      if (isMockMode()) return mockDb.getChecklistModeloPorTipo(tipo);
      return request<ChecklistModelo>(`/modelos/tipo/${encodeURIComponent(tipo)}`);
    }
  },
  materiais: {
    list: async (): Promise<Material[]> => {
      if (isMockMode()) return mockDb.getMateriais();
      return request<Material[]>('/materiais');
    }
  },
  inspecoes: {
    list: async (): Promise<Inspecao[]> => {
      if (isMockMode()) return mockDb.getInspecoes();
      return request<Inspecao[]>('/inspecoes');
    },
    get: async (id: string): Promise<Inspecao | undefined> => {
      if (isMockMode()) return mockDb.getInspecaoById(id);
      return request<Inspecao>(`/inspecoes/${id}`);
    },
    save: async (inspecao: Inspecao): Promise<void> => {
      if (isMockMode()) {
        mockDb.saveInspecao(inspecao);
        return;
      }
      await request<void>('/inspecoes', {
        method: 'POST',
        body: JSON.stringify(inspecao),
      });
    }
  },
  auth: {
    currentUser: (): User => {
      return mockDb.getLogisticaCurrentUser();
    },
    setCurrentUser: (user: User): void => {
      mockDb.setLogisticaCurrentUser(user);
    },
    listUsers: async (): Promise<User[]> => {
      if (isMockMode()) return mockDb.getUsers();
      return request<User[]>('/users');
    }
  },
  upload: {
    file: async (file: File | Blob, filename: string): Promise<string> => {
      if (isMockMode()) {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
      }
      const formData = new FormData();
      formData.append('file', file, filename);
      
      const baseUrl = import.meta.env.VITE_API_BASE_URL || '';
      const response = await fetch(`${baseUrl}/api/upload`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) throw new Error('Falha no upload');
      const data = await response.json();
      return data.url as string;
    }
  }
};

export default api;
