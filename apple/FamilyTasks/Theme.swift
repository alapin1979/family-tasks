import SwiftUI

// Shared palette + small view helpers so the native UI keeps the web app's
// colorful, card-based feel across iOS and macOS.
enum Theme {
    static let indigo = Color(red: 0.39, green: 0.40, blue: 0.95)   // indigo-500
    static let orange = Color(red: 0.98, green: 0.57, blue: 0.24)   // orange-400
    static let purple = Color(red: 0.66, green: 0.33, blue: 0.97)   // purple-500
    static let green  = Color(red: 0.13, green: 0.77, blue: 0.37)   // green-500
    static let red    = Color(red: 0.94, green: 0.27, blue: 0.27)   // red-500
    static let yellow = Color(red: 0.85, green: 0.65, blue: 0.13)   // yellow-600

    static func balanceColor(_ n: Int) -> Color { n >= 0 ? yellow : red }
}

// Rounded card container matching the web's rounded-2xl white cards.
struct Card<Content: View>: View {
    var padding: CGFloat = 16
    @ViewBuilder var content: Content
    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(cardBG)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Color.primary.opacity(0.06)))
    }
    private var cardBG: Color {
        #if os(iOS)
        return Color(.secondarySystemGroupedBackground)
        #else
        return Color(nsColor: .controlBackgroundColor)
        #endif
    }
}

// A small colored pill/badge (used for points, penalties, tags).
struct Pill: View {
    let text: String
    var color: Color = Theme.indigo
    var body: some View {
        Text(text)
            .font(.caption).fontWeight(.medium)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(color.opacity(0.15))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }
}

extension View {
    // Cross-platform numeric keyboard (no-op on macOS).
    @ViewBuilder func numericKeyboard() -> some View {
        #if os(iOS)
        self.keyboardType(.numberPad)
        #else
        self
        #endif
    }
    @ViewBuilder func plainTitle(_ title: String) -> some View {
        #if os(iOS)
        self.navigationTitle(title).navigationBarTitleDisplayMode(.inline)
        #else
        self.navigationTitle(title)
        #endif
    }
}

let AVATARS = ["👦", "👧", "🧒", "👶", "🐱", "🐶", "🦊", "🐸", "🐼", "🦄", "🐯", "🐻"]

// Numeric text field bound to an Int, formatted with space-grouped thousands
// (matches the web's fmtPts/parsePts inputs).
struct IntField: View {
    let placeholder: String
    @Binding var value: Int
    var minValue: Int = 0
    @State private var text: String = ""

    var body: some View {
        TextField(placeholder, text: $text)
            .textFieldStyle(.roundedBorder)
            .numericKeyboard()
            .multilineTextAlignment(.center)
            .onAppear { text = Logic.fmtPts(value) }
            .onChange(of: text) {
                let parsed = max(minValue, Logic.parsePts(text))
                value = parsed
                let formatted = Logic.fmtPts(parsed)
                if formatted != text { text = formatted }
            }
            .onChange(of: value) {
                if Logic.parsePts(text) != value { text = Logic.fmtPts(value) }
            }
    }
}

// Full-screen soft gradient background, matching the web's pastel gradients.
struct GradientBG: View {
    var colors: [Color]
    var body: some View {
        LinearGradient(colors: colors.map { $0.opacity(0.18) },
                       startPoint: .topLeading, endPoint: .bottomTrailing)
            .ignoresSafeArea()
    }
}
