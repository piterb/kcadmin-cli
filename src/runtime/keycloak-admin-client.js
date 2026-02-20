import { CliError } from "../errors.js";

function normalizeServer(server) {
  return server.endsWith("/") ? server.slice(0, -1) : server;
}

async function requestJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  const data = text ? (() => {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  })() : null;
  return { res, data, text };
}

export class KeycloakAdminClient {
  constructor({ server, username, password }) {
    this.server = normalizeServer(server);
    this.username = username;
    this.password = password;
    this.token = "";
  }

  async login() {
    const body = new URLSearchParams({
      grant_type: "password",
      client_id: "admin-cli",
      username: this.username,
      password: this.password
    });

    const { res, data } = await requestJson(`${this.server}/realms/master/protocol/openid-connect/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body
    });

    if (!res.ok || !data?.access_token) {
      const details = typeof data === "object" && data !== null ? JSON.stringify(data) : String(data ?? "");
      throw new CliError(
        `failed to login to Keycloak admin API at ${this.server} (status ${res.status}${details ? `, ${details}` : ""})`
      );
    }

    this.token = data.access_token;
  }

  async adminRequest(path, { method = "GET", body, expected = [200] } = {}) {
    if (!this.token) {
      await this.login();
    }

    const headers = {
      authorization: `Bearer ${this.token}`
    };

    let payload;
    if (body !== undefined) {
      headers["content-type"] = "application/json";
      payload = JSON.stringify(body);
    }

    const { res, data, text } = await requestJson(`${this.server}${path}`, {
      method,
      headers,
      body: payload
    });

    if (!expected.includes(res.status)) {
      throw new CliError(`admin API request failed (${method} ${path}): status ${res.status} ${text}`);
    }

    return { status: res.status, data, text, headers: res.headers };
  }

  async realmExists(realm) {
    const { status } = await this.adminRequest(`/admin/realms/${encodeURIComponent(realm)}`, {
      expected: [200, 404]
    });
    return status === 200;
  }

  async listRealms() {
    const { data } = await this.adminRequest("/admin/realms", {
      expected: [200]
    });
    return Array.isArray(data) ? data : [];
  }

  async createRealm(realmRepresentation) {
    await this.adminRequest("/admin/realms", {
      method: "POST",
      body: realmRepresentation,
      expected: [201, 409]
    });
  }

  async updateRealm(realm, realmRepresentation) {
    await this.adminRequest(`/admin/realms/${encodeURIComponent(realm)}`, {
      method: "PUT",
      body: realmRepresentation,
      expected: [204]
    });
  }

  async deleteRealm(realm) {
    await this.adminRequest(`/admin/realms/${encodeURIComponent(realm)}`, {
      method: "DELETE",
      expected: [204]
    });
  }

  async exportRealm(realm) {
    const { data } = await this.adminRequest(`/admin/realms/${encodeURIComponent(realm)}`, {
      expected: [200]
    });
    return data;
  }

  async setRealmSslRequired(realm, sslRequired) {
    const existing = await this.exportRealm(realm);
    await this.adminRequest(`/admin/realms/${encodeURIComponent(realm)}`, {
      method: "PUT",
      body: { ...existing, sslRequired },
      expected: [204]
    });
  }

  async findUserByUsername(realm, username) {
    const { data } = await this.adminRequest(
      `/admin/realms/${encodeURIComponent(realm)}/users?username=${encodeURIComponent(username)}&exact=true`,
      { expected: [200] }
    );
    if (!Array.isArray(data) || data.length === 0) return null;
    return data[0];
  }

  async createUser(realm, userRepresentation) {
    const result = await this.adminRequest(`/admin/realms/${encodeURIComponent(realm)}/users`, {
      method: "POST",
      body: userRepresentation,
      expected: [201, 409]
    });
    return result;
  }

  async updateUser(realm, userId, userRepresentation) {
    await this.adminRequest(`/admin/realms/${encodeURIComponent(realm)}/users/${encodeURIComponent(userId)}`, {
      method: "PUT",
      body: userRepresentation,
      expected: [204]
    });
  }

  async setUserPassword(realm, userId, password) {
    await this.adminRequest(`/admin/realms/${encodeURIComponent(realm)}/users/${encodeURIComponent(userId)}/reset-password`, {
      method: "PUT",
      body: {
        type: "password",
        value: password,
        temporary: false
      },
      expected: [204]
    });
  }

  async getRealmRole(realm, roleName) {
    const { data } = await this.adminRequest(`/admin/realms/${encodeURIComponent(realm)}/roles/${encodeURIComponent(roleName)}`, {
      expected: [200]
    });
    return data;
  }

  async addRealmRolesToUser(realm, userId, roles) {
    await this.adminRequest(
      `/admin/realms/${encodeURIComponent(realm)}/users/${encodeURIComponent(userId)}/role-mappings/realm`,
      {
        method: "POST",
        body: roles,
        expected: [204]
      }
    );
  }
}
