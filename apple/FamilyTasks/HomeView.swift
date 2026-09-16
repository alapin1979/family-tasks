import SwiftUI

// Home chooser + PIN gates, mirroring HomeScreen.tsx. Routes into the parent
// or child dashboards once the correct PIN is entered.
struct HomeView: View {
    @EnvironmentObject var store: Store
    @State private var route: Route?
    @State private var sheet: Sheet?

    enum Route: Hashable { case parent, child(String) }
    enum Sheet: Identifiable, Hashable {
        case parentPin, createParentPin, childPicker, settings
        var id: Int { hashValue }
    }

    var body: some View {
        switch route {
        case .parent:
            ParentDashboardView(onLogout: { route = nil })
        case .child(let id):
            ChildDashboardView(childId: id, onLogout: { route = nil })
        case nil:
            chooser
        }
    }

    private var chooser: some View {
        ZStack {
            GradientBG(colors: [.blue, Theme.purple, .pink])
            if !store.loaded {
                VStack(spacing: 12) {
                    Text("🌟").font(.system(size: 48))
                    Text("Загрузка...").foregroundStyle(.secondary)
                }
            } else {
                VStack(spacing: 24) {
                    VStack(spacing: 8) {
                        Text("🌟").font(.system(size: 60))
                        Text("Семейные задания").font(.largeTitle.bold())
                        Text("Ежедневные задачи и награды для всей семьи")
                            .foregroundStyle(.secondary).multilineTextAlignment(.center)
                    }
                    VStack(spacing: 14) {
                        chooserButton(icon: "👨‍👩‍👧‍👦", title: "Я родитель",
                                      subtitle: "Управлять заданиями и наградами",
                                      color: Theme.indigo) { handleParentTap() }
                        chooserButton(icon: "⭐", title: "Я ребёнок",
                                      subtitle: "Смотреть задания и зарабатывать награды",
                                      color: Theme.orange) { sheet = .childPicker }
                    }
                    .frame(maxWidth: 420)
                }
                .padding()
            }

            if let err = store.syncError {
                VStack {
                    Spacer()
                    Text(err).font(.caption).padding(8)
                        .background(Theme.red.opacity(0.12)).foregroundStyle(Theme.red)
                        .clipShape(Capsule())
                        .padding(.bottom, 8)
                }
            }
        }
        .safeAreaInset(edge: .top) { familyBar }
        .sheet(item: $sheet) { which in
            switch which {
            case .parentPin:       ParentPinSheet(onSuccess: { sheet = nil; route = .parent })
            case .createParentPin: CreateParentPinSheet(onSuccess: { sheet = nil; route = .parent })
            case .childPicker:     ChildPickerSheet(onSuccess: { id in sheet = nil; route = .child(id) })
            case .settings:        AccountSettingsView()
            }
        }
    }

    private var familyBar: some View {
        HStack(spacing: 8) {
            Spacer()
            if !store.familyLogin.isEmpty {
                Text("Семья: \(store.familyLogin)").font(.caption).foregroundStyle(.secondary)
                Button("настройки") { sheet = .settings }.font(.caption).buttonStyle(.plain).foregroundStyle(Theme.indigo)
                Text("·").foregroundStyle(.secondary)
                Button("сменить") { store.logout() }.font(.caption).buttonStyle(.plain).foregroundStyle(Theme.indigo)
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 6)
    }

    private func handleParentTap() {
        sheet = store.state.parentPin.isEmpty ? .createParentPin : .parentPin
    }

    private func chooserButton(icon: String, title: String, subtitle: String,
                               color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 16) {
                Text(icon).font(.system(size: 36))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.headline)
                    Text(subtitle).font(.subheadline).foregroundStyle(.white.opacity(0.85))
                }
                Spacer()
            }
            .padding(20)
            .frame(maxWidth: .infinity)
            .background(color).foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Parent PIN entry

private struct ParentPinSheet: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) var dismiss
    var onSuccess: () -> Void
    @State private var pin = ""
    @State private var error = false

    var body: some View {
        PinScaffold(emoji: "🔐", title: "Вход для родителя", subtitle: "Введите PIN-код для входа",
                    onCancel: { dismiss() }) {
            SecureField("Введите PIN", text: $pin)
                .textFieldStyle(.roundedBorder).multilineTextAlignment(.center)
                .numericKeyboard()
                .onChange(of: pin) { error = false }
                .onSubmit(submit)
            if error { Text("Неверный PIN-код").font(.footnote).foregroundStyle(Theme.red) }
            PrimaryButton(title: "Войти", color: Theme.indigo, action: submit)
        }
    }
    private func submit() {
        if pin == store.state.parentPin { onSuccess() } else { error = true; pin = "" }
    }
}

private struct CreateParentPinSheet: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) var dismiss
    var onSuccess: () -> Void
    @State private var newPin = ""
    @State private var confirm = ""
    @State private var error = ""

    var body: some View {
        PinScaffold(emoji: "🔐", title: "Придумайте PIN родителя",
                    subtitle: "Это ваш первый вход — задайте PIN-код для входа родителя",
                    onCancel: { dismiss() }) {
            SecureField("Новый PIN (4+ цифры)", text: $newPin)
                .textFieldStyle(.roundedBorder).multilineTextAlignment(.center).numericKeyboard()
                .onChange(of: newPin) { newPin = newPin.filter(\.isNumber); error = "" }
            SecureField("Повторите PIN", text: $confirm)
                .textFieldStyle(.roundedBorder).multilineTextAlignment(.center).numericKeyboard()
                .onChange(of: confirm) { confirm = confirm.filter(\.isNumber); error = "" }
            if !error.isEmpty { Text(error).font(.footnote).foregroundStyle(Theme.red) }
            PrimaryButton(title: "Сохранить и войти", color: Theme.indigo, action: submit)
        }
    }
    private func submit() {
        if newPin.count < 4 { error = "PIN должен быть не менее 4 цифр"; return }
        if newPin != confirm { error = "PIN-коды не совпадают"; return }
        store.setParentPin(newPin)
        onSuccess()
    }
}

private struct ChildPickerSheet: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) var dismiss
    var onSuccess: (String) -> Void
    @State private var selected = ""
    @State private var pin = ""
    @State private var error = false

    var body: some View {
        PinScaffold(emoji: "👦", title: "Кто ты?", subtitle: nil, onCancel: { dismiss() }) {
            if store.state.children.isEmpty {
                Text("Дети ещё не добавлены. Попроси родителя настроить твой профиль!")
                    .font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
            } else {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                    ForEach(store.state.children) { c in
                        Button {
                            selected = c.id; pin = ""; error = false
                        } label: {
                            VStack(spacing: 4) {
                                Text(c.avatar).font(.system(size: 30))
                                Text(c.name).font(.subheadline).foregroundStyle(.primary)
                            }
                            .frame(maxWidth: .infinity).padding(.vertical, 14)
                            .background(RoundedRectangle(cornerRadius: 14)
                                .stroke(selected == c.id ? Theme.orange : Color.gray.opacity(0.3), lineWidth: 2))
                            .background(selected == c.id ? Theme.orange.opacity(0.1) : .clear)
                        }
                        .buttonStyle(.plain)
                    }
                }
                if !selected.isEmpty {
                    let name = store.child(selected)?.name ?? ""
                    Text("Введи PIN-код \(name)").font(.subheadline).foregroundStyle(.secondary)
                    SecureField("PIN", text: $pin)
                        .textFieldStyle(.roundedBorder).multilineTextAlignment(.center).numericKeyboard()
                        .onChange(of: pin) { error = false }
                        .onSubmit(submit)
                    if error { Text("Неверный PIN-код").font(.footnote).foregroundStyle(Theme.red) }
                    PrimaryButton(title: "Вперёд!", color: Theme.orange, action: submit)
                }
            }
        }
    }
    private func submit() {
        guard let child = store.child(selected) else { return }
        if child.pin == pin { onSuccess(selected) } else { error = true; pin = "" }
    }
}

// Shared sheet chrome for the PIN screens.
private struct PinScaffold<Content: View>: View {
    let emoji: String
    let title: String
    let subtitle: String?
    var onCancel: () -> Void
    @ViewBuilder var content: Content

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                HStack {
                    Button("← Назад", action: onCancel).buttonStyle(.plain).foregroundStyle(.secondary)
                    Spacer()
                }
                Text(emoji).font(.system(size: 40))
                Text(title).font(.title3.bold()).multilineTextAlignment(.center)
                if let subtitle { Text(subtitle).font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center) }
                content
            }
            .padding(24)
            .frame(maxWidth: 380)
            .frame(maxWidth: .infinity)
        }
        #if os(macOS)
        .frame(minWidth: 360, minHeight: 360)
        #endif
    }
}

struct PrimaryButton: View {
    let title: String
    var color: Color = Theme.indigo
    var action: () -> Void
    var body: some View {
        Button(action: action) {
            Text(title).fontWeight(.semibold)
                .frame(maxWidth: .infinity).padding(.vertical, 12)
        }
        .background(color).foregroundStyle(.white)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .buttonStyle(.plain)
    }
}
