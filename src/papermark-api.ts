export type PapermarkAuth = {
  sessionToken: string;
  csrfToken?: string;
  baseUrl?: string;
};

export class PapermarkApiError extends Error {
  status: number;
  data?: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = "PapermarkApiError";
    this.status = status;
    this.data = data;
  }
}

export type DataroomListOptions = {
  teamId: string;
  search?: string;
  status?: string;
  tags?: string;
  simple?: boolean;
};

export type DataroomSummary = {
  id: string;
  name: string;
  internalName: string | null;
  createdAt: string;
};

type RequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
};

export function buildCookieHeader(auth: PapermarkAuth): string {
  const parts = [`__Secure-next-auth.session-token=${auth.sessionToken}`];
  if (auth.csrfToken) parts.push(`__Host-next-auth.csrf-token=${auth.csrfToken}`);
  return parts.join("; ");
}

export class PapermarkApiClient {
  private auth: PapermarkAuth;
  private userAgent: string;
  private baseUrl: string;

  constructor({ auth, userAgent = "papermark-cli/0.0.0" }: { auth: PapermarkAuth; userAgent?: string }) {
    this.auth = auth;
    this.userAgent = userAgent;
    this.baseUrl = (auth.baseUrl || "https://app.papermark.com").replace(/\/+$/, "");
  }

  private buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>): string {
    const url = new URL(path, this.baseUrl);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === "") continue;
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private async request<T>(path: string, query?: Record<string, string | number | boolean | undefined>, options: RequestOptions = {}): Promise<T> {
    const url = this.buildUrl(path, query);
    const response = await fetch(url, {
      method: options.method || "GET",
      headers: {
        accept: "application/json",
        "content-type": options.body ? "application/json" : "application/json",
        cookie: buildCookieHeader(this.auth),
        "user-agent": this.userAgent,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });

    const text = await response.text();
    const data = text ? tryParseJson(text) : null;

    if (!response.ok) {
      throw new PapermarkApiError(readErrorMessage(response.status, data, text), response.status, data || text);
    }

    return (data ?? text) as T;
  }

  listDatarooms(options: DataroomListOptions): Promise<{ datarooms: DataroomSummary[]; totalCount?: number }> {
    return this.request(`/api/teams/${options.teamId}/datarooms`, {
      search: options.search,
      simple: options.simple ?? true,
      status: options.status,
      tags: options.tags,
    });
  }

  getDataroom(teamId: string, dataroomId: string): Promise<Record<string, unknown>> {
    return this.request(`/api/teams/${teamId}/datarooms/${dataroomId}`);
  }

  getDataroomFolders(teamId: string, dataroomId: string): Promise<unknown[]> {
    return this.request(`/api/teams/${teamId}/datarooms/${dataroomId}/folders`);
  }

  getDataroomViews(teamId: string, dataroomId: string): Promise<Record<string, unknown>> {
    return this.request(`/api/teams/${teamId}/datarooms/${dataroomId}/views`);
  }

  getDataroomViewsCount(teamId: string, dataroomId: string): Promise<Record<string, unknown>> {
    return this.request(`/api/teams/${teamId}/datarooms/${dataroomId}/views-count`);
  }

  getDataroomViewers(teamId: string, dataroomId: string): Promise<unknown[]> {
    return this.request(`/api/teams/${teamId}/datarooms/${dataroomId}/viewers`);
  }

  getDataroomLinks(teamId: string, dataroomId: string): Promise<unknown[]> {
    return this.request(`/api/teams/${teamId}/datarooms/${dataroomId}/links`);
  }

  getDataroomGroups(teamId: string, dataroomId: string): Promise<unknown[]> {
    return this.request(`/api/teams/${teamId}/datarooms/${dataroomId}/groups`);
  }

  getDataroomPermissionGroups(teamId: string, dataroomId: string): Promise<unknown[]> {
    return this.request(`/api/teams/${teamId}/datarooms/${dataroomId}/permission-groups`);
  }

  getDataroomStats(teamId: string, dataroomId: string): Promise<Record<string, unknown>> {
    return this.request(`/api/teams/${teamId}/datarooms/${dataroomId}/stats`);
  }

  getDataroomExportVisits(teamId: string, dataroomId: string): Promise<unknown[]> {
    return this.request(`/api/teams/${teamId}/datarooms/${dataroomId}/export-visits`);
  }
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function readErrorMessage(status: number, data: unknown, text: string): string {
  if (typeof data === "object" && data && !Array.isArray(data)) {
    const maybe = (data as Record<string, unknown>).message || (data as Record<string, unknown>).error;
    if (typeof maybe === "string" && maybe.trim()) return maybe;
  }
  if (text.trim()) return `Papermark request failed (${status})`;
  return `Papermark request failed (${status})`;
}
