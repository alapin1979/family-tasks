import Foundation

// Local session persistence, mirroring the web app's localStorage token/login.
enum Session {
    private static let tokenKey = "family_token"
    private static let loginKey = "family_login"

    static var token: String? { UserDefaults.standard.string(forKey: tokenKey) }
    static var login: String? { UserDefaults.standard.string(forKey: loginKey) }

    static func save(token: String, login: String) {
        UserDefaults.standard.set(token, forKey: tokenKey)
        UserDefaults.standard.set(login, forKey: loginKey)
    }
    static func clear() {
        UserDefaults.standard.removeObject(forKey: tokenKey)
        UserDefaults.standard.removeObject(forKey: loginKey)
    }
}
