import SwiftUI

// Family login/password change, mirroring AccountSettings.tsx → PUT /api/account.
struct AccountSettingsView: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) var dismiss
    @State private var currentPassword = ""
    @State private var newLogin = ""
    @State private var newPassword = ""
    @State private var confirmPassword = ""
    @State private var error = ""
    @State private var success = ""
    @State private var busy = false

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                HStack {
                    Button("← Назад") { dismiss() }.buttonStyle(.plain).foregroundStyle(.secondary)
                    Spacer()
                }
                Text("⚙️").font(.system(size: 40))
                Text("Настройки семьи").font(.title3.bold())
                Text("Измените логин или пароль вашей семьи")
                    .font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)

                VStack(spacing: 10) {
                    SecureField("Текущий пароль", text: $currentPassword)
                        .onChange(of: currentPassword) { error = "" }
                    TextField("Новый логин", text: $newLogin)
                        #if os(iOS)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                        #endif
                        .onChange(of: newLogin) { error = "" }
                    SecureField("Новый пароль (не меняется, если пусто)", text: $newPassword)
                        .onChange(of: newPassword) { error = "" }
                    if !newPassword.isEmpty {
                        SecureField("Повторите новый пароль", text: $confirmPassword)
                            .onChange(of: confirmPassword) { error = "" }
                    }
                }
                .textFieldStyle(.roundedBorder)

                if !error.isEmpty { Text(error).font(.footnote).foregroundStyle(Theme.red).multilineTextAlignment(.center) }
                if !success.isEmpty { Text(success).font(.footnote).foregroundStyle(Theme.green).multilineTextAlignment(.center) }

                PrimaryButton(title: busy ? "..." : "Сохранить", color: Theme.indigo) {
                    Task { await submit() }
                }
                .disabled(busy)
            }
            .padding(24)
            .frame(maxWidth: 380)
            .frame(maxWidth: .infinity)
        }
        .onAppear { newLogin = store.familyLogin }
        #if os(macOS)
        .frame(minWidth: 360, minHeight: 420)
        #endif
    }

    private func submit() async {
        error = ""; success = ""
        guard !currentPassword.isEmpty else { error = "Введите текущий пароль"; return }
        let trimmed = newLogin.trimmingCharacters(in: .whitespaces)
        let loginChanged = !trimmed.isEmpty && trimmed != store.familyLogin
        let passwordChanged = !newPassword.isEmpty
        guard loginChanged || passwordChanged else { error = "Измените логин или пароль"; return }
        if passwordChanged {
            guard newPassword.count >= 4 else { error = "Новый пароль должен быть не менее 4 символов"; return }
            guard newPassword == confirmPassword else { error = "Пароли не совпадают"; return }
        }
        busy = true
        defer { busy = false }
        do {
            try await store.updateAccount(
                currentPassword: currentPassword,
                newLogin: loginChanged ? trimmed : nil,
                newPassword: passwordChanged ? newPassword : nil)
            success = "Изменения сохранены"
            currentPassword = ""; newPassword = ""; confirmPassword = ""
        } catch let APIError.code(code) {
            switch code {
            case "invalid_password": error = "Неверный текущий пароль"
            case "login_taken": error = "Такой логин уже занят"
            case "weak_password": error = "Новый пароль должен быть не менее 4 символов"
            case "invalid_input": error = "Измените логин или пароль"
            default: error = "Не удалось сохранить. Попробуйте ещё раз."
            }
        } catch APIError.network {
            error = "Ошибка соединения с сервером"
        } catch {
            self.error = "Не удалось сохранить. Попробуйте ещё раз."
        }
    }
}
