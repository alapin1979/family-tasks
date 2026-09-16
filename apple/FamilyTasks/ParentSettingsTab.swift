import SwiftUI

// Change the parent PIN, mirroring parent/SettingsTab.tsx.
struct ParentSettingsTab: View {
    @EnvironmentObject var store: Store
    @State private var currentPin = ""
    @State private var newPin = ""
    @State private var confirmPin = ""
    @State private var error = ""
    @State private var success = false

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                Text("Изменить PIN родителя").font(.headline)
                pinField("Текущий PIN", $currentPin)
                pinField("Новый PIN", $newPin)
                pinField("Подтвердите новый PIN", $confirmPin)
                if !error.isEmpty { Text(error).font(.footnote).foregroundStyle(Theme.red) }
                if success { Text("PIN успешно изменён!").font(.footnote).foregroundStyle(Theme.green) }
                PrimaryButton(title: "Изменить PIN", color: Theme.indigo, action: change)
            }
        }
    }

    private func pinField(_ label: String, _ binding: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            SecureField(label, text: binding).textFieldStyle(.roundedBorder).numericKeyboard()
                .onChange(of: binding.wrappedValue) {
                    binding.wrappedValue = String(binding.wrappedValue.filter(\.isNumber).prefix(8))
                    error = ""; success = false
                }
        }
    }

    private func change() {
        guard currentPin == store.state.parentPin else { error = "Текущий PIN неверен"; return }
        guard newPin.count >= 4 else { error = "Новый PIN должен быть не менее 4 цифр"; return }
        guard newPin == confirmPin else { error = "PIN-коды не совпадают"; return }
        store.setParentPin(newPin)
        currentPin = ""; newPin = ""; confirmPin = ""; error = ""; success = true
    }
}
