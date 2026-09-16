import SwiftUI

// Add / edit / remove children, mirroring parent/ChildrenTab.tsx.
struct ParentChildrenTab: View {
    @EnvironmentObject var store: Store

    @State private var name = ""
    @State private var pin = ""
    @State private var avatar = "👦"
    @State private var error = ""

    @State private var editingId: String?
    @State private var editName = ""
    @State private var editPin = ""
    @State private var editAvatar = "👦"
    @State private var editError = ""

    var body: some View {
        VStack(spacing: 20) {
            addForm
            VStack(spacing: 12) {
                if store.state.children.isEmpty {
                    Text("Дети ещё не добавлены").foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity).padding(.vertical, 24)
                }
                ForEach(store.state.children) { child in
                    if editingId == child.id { editCard(child) } else { row(child) }
                }
            }
        }
    }

    private var addForm: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                Text("Добавить ребёнка").font(.headline)
                Text("Аватар").font(.caption).foregroundStyle(.secondary)
                AvatarPicker(selected: $avatar)
                HStack(alignment: .top, spacing: 10) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Имя").font(.caption).foregroundStyle(.secondary)
                        TextField("Имя ребёнка", text: $name).textFieldStyle(.roundedBorder)
                            .onChange(of: name) { error = "" }
                    }
                    VStack(alignment: .leading, spacing: 4) {
                        Text("PIN (4+ цифры)").font(.caption).foregroundStyle(.secondary)
                        SecureField("например, 1234", text: $pin).textFieldStyle(.roundedBorder).numericKeyboard()
                            .onChange(of: pin) { pin = String(pin.filter(\.isNumber).prefix(6)); error = "" }
                    }
                }
                if !error.isEmpty { Text(error).font(.footnote).foregroundStyle(Theme.red) }
                PrimaryButton(title: "+ Добавить ребёнка", color: Theme.indigo, action: add)
            }
        }
    }

    private func row(_ child: Child) -> some View {
        Card {
            HStack {
                Text(child.avatar).font(.system(size: 30))
                VStack(alignment: .leading, spacing: 2) {
                    Text(child.name).font(.headline)
                    Text("PIN: \(String(repeating: "•", count: child.pin.count))")
                        .font(.caption2).foregroundStyle(.secondary)
                }
                Spacer()
                Button { openEdit(child) } label: { Text("✏️") }.buttonStyle(.plain)
                Button { store.removeChild(child.id) } label: { Text("✕").foregroundStyle(.secondary) }.buttonStyle(.plain)
            }
        }
    }

    private func editCard(_ child: Child) -> some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("Редактировать профиль").font(.headline)
                    Spacer()
                    Button { editingId = nil } label: { Text("✕").foregroundStyle(.secondary) }.buttonStyle(.plain)
                }
                Text("Аватар").font(.caption).foregroundStyle(.secondary)
                AvatarPicker(selected: $editAvatar)
                HStack(alignment: .top, spacing: 10) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Имя").font(.caption).foregroundStyle(.secondary)
                        TextField("Имя", text: $editName).textFieldStyle(.roundedBorder)
                            .onChange(of: editName) { editError = "" }
                    }
                    VStack(alignment: .leading, spacing: 4) {
                        Text("PIN (4+ цифры)").font(.caption).foregroundStyle(.secondary)
                        SecureField("PIN", text: $editPin).textFieldStyle(.roundedBorder).numericKeyboard()
                            .onChange(of: editPin) { editPin = String(editPin.filter(\.isNumber).prefix(6)); editError = "" }
                    }
                }
                if !editError.isEmpty { Text(editError).font(.footnote).foregroundStyle(Theme.red) }
                PrimaryButton(title: "Сохранить", color: Theme.indigo, action: saveEdit)
            }
        }
    }

    private func add() {
        guard !name.trimmingCharacters(in: .whitespaces).isEmpty else { error = "Имя обязательно"; return }
        guard pin.count >= 4 else { error = "PIN должен быть не менее 4 цифр"; return }
        store.addChild(name: name.trimmingCharacters(in: .whitespaces), avatar: avatar, pin: pin)
        name = ""; pin = ""; avatar = "👦"; error = ""
    }

    private func openEdit(_ child: Child) {
        editingId = child.id; editName = child.name; editPin = child.pin; editAvatar = child.avatar; editError = ""
    }

    private func saveEdit() {
        guard let id = editingId else { return }
        guard !editName.trimmingCharacters(in: .whitespaces).isEmpty else { editError = "Имя обязательно"; return }
        guard editPin.count >= 4 else { editError = "PIN должен быть не менее 4 цифр"; return }
        store.editChild(id, name: editName.trimmingCharacters(in: .whitespaces), avatar: editAvatar, pin: editPin)
        editingId = nil
    }
}

// Wrapping grid of the shared AVATARS, highlighting the selected one.
struct AvatarPicker: View {
    @Binding var selected: String
    var columns = 6
    var body: some View {
        let cols = Array(repeating: GridItem(.flexible(), spacing: 6), count: columns)
        LazyVGrid(columns: cols, spacing: 6) {
            ForEach(AVATARS, id: \.self) { a in
                Button { selected = a } label: {
                    Text(a).font(.system(size: 26))
                        .frame(maxWidth: .infinity).frame(height: 42)
                        .background(selected == a ? Theme.indigo.opacity(0.15) : Color.clear)
                        .overlay(RoundedRectangle(cornerRadius: 10)
                            .stroke(selected == a ? Theme.indigo : Color.clear, lineWidth: 2))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .buttonStyle(.plain)
            }
        }
    }
}
