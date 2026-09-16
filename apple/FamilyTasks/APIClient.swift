import Foundation

enum APIError: Error, LocalizedError {
    case unauthorized
    case code(String)          // server-provided error code, e.g. "login_taken"
    case badStatus(Int)
    case network

    var errorDescription: String? {
        switch self {
        case .unauthorized: return "Сессия истекла. Войдите заново."
        case .code(let c): return c
        case .badStatus(let s): return "Ошибка сервера (\(s))"
        case .network: return "Ошибка соединения с сервером"
        }
    }
}

struct AuthResponse: Decodable { let token: String; let familyId: String; let login: String }
private struct ErrorBody: Decodable { let error: String? }
private struct AccountResponse: Decodable { let ok: Bool?; let login: String? }

// Talks to the same Express API the web app uses, so both clients share one
// server-side source of truth. Base URL defaults to the live deployment but
// can be overridden with the FT_API_BASE env var (used by the local
// write-safety harness / dev against a throwaway server).
struct APIClient {
    let baseURL: URL

    init(baseURL: URL? = nil) {
        if let baseURL { self.baseURL = baseURL }
        else if let env = ProcessInfo.processInfo.environment["FT_API_BASE"], let u = URL(string: env) {
            self.baseURL = u
        } else {
            self.baseURL = URL(string: "https://192-3-76-149.sslip.io")!
        }
    }

    private func request(_ path: String, method: String, token: String? = nil, body: Data? = nil) -> URLRequest {
        var req = URLRequest(url: baseURL.appendingPathComponent(path))
        req.httpMethod = method
        if let token { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = body
        }
        return req
    }

    private func send(_ req: URLRequest) async throws -> (Data, HTTPURLResponse) {
        do {
            let (data, resp) = try await URLSession.shared.data(for: req)
            guard let http = resp as? HTTPURLResponse else { throw APIError.network }
            return (data, http)
        } catch let e as APIError {
            throw e
        } catch {
            throw APIError.network
        }
    }

    private func decodeErrorCode(_ data: Data) -> String? {
        (try? JSONDecoder().decode(ErrorBody.self, from: data))?.error
    }

    // MARK: auth

    func login(login: String, password: String) async throws -> AuthResponse {
        try await auth(path: "api/login", login: login, password: password)
    }
    func register(login: String, password: String) async throws -> AuthResponse {
        try await auth(path: "api/register", login: login, password: password)
    }

    private func auth(path: String, login: String, password: String) async throws -> AuthResponse {
        let body = try JSONSerialization.data(withJSONObject: ["login": login, "password": password])
        let (data, http) = try await send(request(path, method: "POST", body: body))
        guard http.statusCode == 200 else { throw APIError.code(decodeErrorCode(data) ?? "http_\(http.statusCode)") }
        return try JSONDecoder().decode(AuthResponse.self, from: data)
    }

    // MARK: family state

    func getState(token: String) async throws -> AppState {
        let (data, http) = try await send(request("api/state", method: "GET", token: token))
        if http.statusCode == 401 { throw APIError.unauthorized }
        guard http.statusCode == 200 else { throw APIError.badStatus(http.statusCode) }
        return try JSONDecoder().decode(AppState.self, from: data)
    }

    // Sends the COMPLETE state; the server replaces the whole family file with
    // this body, so callers must pass a full, unabridged AppState.
    func putState(_ state: AppState, token: String) async throws {
        let body = try JSONEncoder().encode(state)
        let (_, http) = try await send(request("api/state", method: "PUT", token: token, body: body))
        if http.statusCode == 401 { throw APIError.unauthorized }
        guard http.statusCode == 200 else { throw APIError.badStatus(http.statusCode) }
    }

    // MARK: account (self-service credential change) — returns the saved login

    func updateAccount(currentPassword: String, newLogin: String?, newPassword: String?, token: String) async throws -> String {
        var payload: [String: String] = ["currentPassword": currentPassword]
        if let newLogin, !newLogin.isEmpty { payload["newLogin"] = newLogin }
        if let newPassword, !newPassword.isEmpty { payload["newPassword"] = newPassword }
        let body = try JSONSerialization.data(withJSONObject: payload)
        let (data, http) = try await send(request("api/account", method: "PUT", token: token, body: body))
        if http.statusCode == 401 { throw APIError.code(decodeErrorCode(data) ?? "invalid_password") }
        guard http.statusCode == 200 else { throw APIError.code(decodeErrorCode(data) ?? "http_\(http.statusCode)") }
        return (try? JSONDecoder().decode(AccountResponse.self, from: data))?.login ?? (newLogin ?? "")
    }
}
