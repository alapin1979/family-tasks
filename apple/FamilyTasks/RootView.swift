import SwiftUI

// Auth gate: shows the family login until a token exists, then the home
// chooser. Mirrors App.tsx (FamilyLogin → AppInner).
struct RootView: View {
    @EnvironmentObject var store: Store

    var body: some View {
        Group {
            if store.authed {
                HomeView()
            } else {
                FamilyLoginView()
            }
        }
        .task(id: store.authed) {
            // Cold start with a saved token: pull state once.
            if store.authed && !store.loaded { await store.load() }
        }
    }
}
