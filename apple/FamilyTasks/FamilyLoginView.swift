import SwiftUI

// Family login / register, mirroring FamilyLogin.tsx.
struct FamilyLoginView: View {
    @EnvironmentObject var store: Store
    @State private var mode: Mode = .login
    @State private var login = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var error = ""
    @State private var busy = false

    enum Mode { case login, register }

    var body: some View {
        ZStack {
            GradientBG(colors: [.blue, Theme.purple, .pink])
            ScrollView {
                VStack(spacing: 0) {
                    Card(padding: 28) {
                        VStack(spacing: 14) {
                            Text("🏠").font(.system(size: 44))
                            Text(mode == .login ? "Вход для семьи" : "Новая семья")
                                .font(.title3.bold())
                            Text(mode == .login
                                 ? "Введите логин и пароль вашей семьи"
                                 : "Придумайте логин и пароль для вашей семьи")
                                .font(.subheadline).foregroundStyle(.secondary)
                                .multilineTextAlignment(.center)

                            VStack(spacing: 10) {
                                TextField("Логин семьи", text: $login)
                                    .textContentType(.username)
                                    #if os(iOS)
                                    .textInputAutocapitalization(.never)
                                    .autocorrectionDisabled()
                                    #endif
                                    .onChange(of: login) { error = "" }
                                SecureField("Пароль", text: $password)
                                    .onChange(of: password) { error = "" }
                                if mode == .register {
                                    SecureField("Повторите пароль", text: $confirmPassword)
                                        .onChange(of: confirmPassword) { error = "" }
                                }
                            }
                            .textFieldStyle(.roundedBorder)
                            .onSubmit { Task { await submit() } }

                            if !error.isEmpty {
                                Text(error).font(.footnote).foregroundStyle(Theme.red)
                                    .multilineTextAlignment(.center)
                            }

                            Button {
                                Task { await submit() }
                            } label: {
                                Text(busy ? "..." : (mode == .login ? "Войти" : "Создать семью"))
                                    .fontWeight(.semibold)
                                    .frame(maxWidth: .infinity).padding(.vertical, 12)
                            }
                            .background(Theme.indigo).foregroundStyle(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                            .disabled(busy)

                            Button {
                                mode = mode == .login ? .register : .login
                                error = ""; password = ""; confirmPassword = ""
                            } label: {
                                Text(mode == .login ? "Впервые здесь? Создать семью" : "Уже есть семья? Войти")
                                    .font(.subheadline).foregroundStyle(Theme.indigo)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .frame(maxWidth: 360)
                    .padding()
                }
                .frame(maxWidth: .infinity)
            }
        }
    }

    private func submit() async {
        error = ""
        let l = login.trimmingCharacters(in: .whitespaces)
        guard !l.isEmpty, !password.isEmpty else { error = "Заполните логин и пароль"; return }
        if mode == .register {
            guard password.count >= 4 else { error = "Пароль должен быть не менее 4 символов"; return }
            guard password == confirmPassword else { error = "Пароли не совпадают"; return }
        }
        busy = true
        defer { busy = false }
        do {
            try await store.authenticate(login: l, password: password, register: mode == .register)
        } catch let APIError.code(code) {
            switch code {
            case "login_taken": error = "Такой логин уже занят"
            case "invalid_credentials": error = "Неверный логин или пароль"
            default: error = "Не удалось выполнить вход. Попробуйте ещё раз."
            }
        } catch APIError.network {
            error = "Ошибка соединения с сервером"
        } catch {
            self.error = "Не удалось выполнить вход. Попробуйте ещё раз."
        }
    }
}
