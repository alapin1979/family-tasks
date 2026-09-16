import SwiftUI

// Rewards + manual penalties, mirroring parent/RewardsTab.tsx (two sub-tabs).
struct ParentRewardsTab: View {
    @EnvironmentObject var store: Store
    @State private var subTab: SubTab = .rewards
    @State private var suggestionPrices: [String: Int] = [:]

    // Reward form
    @State private var showRewardForm = false
    @State private var rTitle = ""; @State private var rDesc = ""
    @State private var rCost = 50; @State private var rOneTime = false; @State private var rError = ""

    // Penalty form
    @State private var showPenaltyForm = false
    @State private var pChildId = ""; @State private var pAmount = 10
    @State private var pReason = ""; @State private var pError = ""

    enum SubTab: Hashable { case rewards, penalties }

    private var s: AppState { store.state }

    var body: some View {
        VStack(spacing: 16) {
            subTabBar
            if subTab == .rewards { rewardsSection } else { penaltiesSection }
        }
    }

    private var subTabBar: some View {
        HStack(spacing: 6) {
            subTabButton(.rewards, "🎁 Награды", badge: store.pendingRewardSuggestions.count)
            subTabButton(.penalties, "⚡ Штрафы", badge: 0)
        }
        .padding(4).background(Color.gray.opacity(0.12)).clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func subTabButton(_ tab: SubTab, _ label: String, badge: Int) -> some View {
        Button { subTab = tab } label: {
            HStack(spacing: 4) {
                Text(label).font(.subheadline.weight(.medium))
                if badge > 0 {
                    Text("\(badge)").font(.caption2.bold()).foregroundStyle(.white)
                        .padding(.horizontal, 6).padding(.vertical, 2).background(Theme.red).clipShape(Capsule())
                }
            }
            .frame(maxWidth: .infinity).padding(.vertical, 8)
            .background(subTab == tab ? cardBG : .clear)
            .foregroundStyle(subTab == tab ? .primary : .secondary)
            .clipShape(RoundedRectangle(cornerRadius: 9))
        }
        .buttonStyle(.plain)
    }

    // MARK: rewards

    private var rewardsSection: some View {
        VStack(spacing: 16) {
            recentClaimsBlock
            if !store.pendingRewardSuggestions.isEmpty { pendingSuggestionsBlock }
            if showRewardForm { rewardForm } else {
                PrimaryButton(title: "+ Добавить награду", color: Theme.indigo) { showRewardForm = true }
            }
            rewardList
        }
    }

    private var recentClaimsBlock: some View {
        let recent = s.rewardClaims.sorted { $0.claimedAt > $1.claimedAt }.prefix(10)
        return Group {
            if !recent.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Потраченные призы").font(.headline)
                    ForEach(Array(recent)) { claim in
                        HStack(spacing: 10) {
                            Text(store.child(claim.childId)?.avatar ?? "?").font(.title3)
                            VStack(alignment: .leading, spacing: 2) {
                                Text("\(store.child(claim.childId)?.name ?? "?") получил(а) «\(claimTitle(claim))»").font(.subheadline)
                                Text(RuDate.longFromISO(claim.claimedAt)).font(.caption2).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text("−\(claimCost(claim)) ⭐").font(.subheadline.weight(.medium)).foregroundStyle(Theme.purple)
                        }
                        .padding(10).background(cardBG).clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                }
            }
        }
    }

    private var pendingSuggestionsBlock: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Предложения детей").font(.headline)
            ForEach(store.pendingRewardSuggestions) { r in
                let child = r.suggestedBy.flatMap { store.child($0) }
                let priceBinding = Binding<Int>(
                    get: { suggestionPrices[r.id] ?? 50 },
                    set: { suggestionPrices[r.id] = max(1, $0) }
                )
                Card {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(alignment: .top, spacing: 8) {
                            Text(child?.avatar ?? "👤").font(.system(size: 26))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(r.title).font(.headline)
                                if !r.description.isEmpty { Text(r.description).font(.subheadline).foregroundStyle(.secondary) }
                                Text("предложил(а) \(child?.name ?? "")").font(.caption).foregroundStyle(Theme.purple)
                            }
                            Spacer()
                        }
                        HStack(spacing: 8) {
                            IntField(placeholder: "баллы", value: priceBinding, minValue: 1).frame(width: 90)
                            Text("баллов").font(.caption).foregroundStyle(.secondary)
                            Button("Одобрить") {
                                store.setPriceForReward(r.id, cost: priceBinding.wrappedValue)
                                suggestionPrices[r.id] = nil
                            }
                            .fontWeight(.semibold).frame(maxWidth: .infinity).padding(.vertical, 8)
                            .background(Theme.purple).foregroundStyle(.white).clipShape(RoundedRectangle(cornerRadius: 10)).buttonStyle(.plain)
                            Button { store.removeReward(r.id) } label: { Text("✕").foregroundStyle(.secondary) }.buttonStyle(.plain)
                        }
                    }
                }
                .overlay(RoundedRectangle(cornerRadius: 18).stroke(Theme.purple.opacity(0.3)))
            }
        }
    }

    private var rewardForm: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("Новая награда").font(.headline)
                    Spacer()
                    Button { showRewardForm = false; rError = "" } label: { Text("✕").foregroundStyle(.secondary) }.buttonStyle(.plain)
                }
                labeled("Название *") {
                    TextField("например, 30 мин. экранного времени", text: $rTitle).textFieldStyle(.roundedBorder)
                        .onChange(of: rTitle) { rError = "" }
                }
                labeled("Описание") {
                    TextField("например, Поход в цирк / Выходной день", text: $rDesc).textFieldStyle(.roundedBorder)
                }
                labeled("Стоимость (баллы)") { IntField(placeholder: "50", value: $rCost, minValue: 1) }
                Toggle(isOn: $rOneTime) {
                    Text("Одноразовый приз (исчезнет после получения)").font(.subheadline)
                }.tint(Theme.indigo)
                if !rError.isEmpty { Text(rError).font(.footnote).foregroundStyle(Theme.red) }
                PrimaryButton(title: "Добавить", color: Theme.indigo, action: addReward)
            }
        }
    }

    private var rewardList: some View {
        let active = s.rewards.filter { $0.pendingCost != true }
        return VStack(spacing: 10) {
            if active.isEmpty {
                Text("Наград пока нет").foregroundStyle(.secondary).frame(maxWidth: .infinity).padding(.vertical, 20)
            }
            ForEach(active) { reward in
                Card {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack(spacing: 6) {
                                Text(reward.title).font(.headline)
                                Pill(text: "\(reward.cost) баллов", color: Theme.purple)
                                if reward.oneTime == true { Pill(text: "одноразовый", color: Theme.orange) }
                            }
                            if let by = reward.suggestedBy, let c = store.child(by) {
                                Pill(text: "идея \(c.avatar) \(c.name)", color: Theme.green)
                            }
                            if !reward.description.isEmpty { Text(reward.description).font(.subheadline).foregroundStyle(.secondary) }
                        }
                        Spacer()
                        Button { store.removeReward(reward.id) } label: { Text("✕").foregroundStyle(.secondary) }.buttonStyle(.plain)
                    }
                }
            }
        }
    }

    // MARK: penalties

    private var penaltiesSection: some View {
        VStack(spacing: 16) {
            if showPenaltyForm { penaltyForm } else {
                PrimaryButton(title: "+ Добавить штраф", color: Theme.red) { showPenaltyForm = true }
            }
            penaltyList
            Text("Автоматические штрафы за пропущенные задания рассчитываются на основе настроек каждого задания и отображаются в разделе «Обзор».")
                .font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
                .frame(maxWidth: .infinity).padding().background(Color.gray.opacity(0.08)).clipShape(RoundedRectangle(cornerRadius: 16))
        }
    }

    private var penaltyForm: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("Новый штраф").font(.headline)
                    Spacer()
                    Button { showPenaltyForm = false; pError = "" } label: { Text("✕").foregroundStyle(.secondary) }.buttonStyle(.plain)
                }
                labeled("Ребёнок *") {
                    if s.children.isEmpty { Text("Нет детей").font(.subheadline).foregroundStyle(.secondary) }
                    else {
                        FlowChips(s.children.map { ($0.id, "\($0.avatar) \($0.name)") },
                                  isOn: { pChildId == $0 }) { pChildId = $0; pError = "" }
                    }
                }
                labeled("Причина *") {
                    TextField("например, Плохое поведение", text: $pReason).textFieldStyle(.roundedBorder)
                        .onChange(of: pReason) { pError = "" }
                }
                labeled("Сумма штрафа (баллы)") { IntField(placeholder: "10", value: $pAmount, minValue: 1) }
                if !pError.isEmpty { Text(pError).font(.footnote).foregroundStyle(Theme.red) }
                PrimaryButton(title: "Применить штраф", color: Theme.red, action: addPenalty)
            }
        }
    }

    private var penaltyList: some View {
        VStack(spacing: 10) {
            if s.manualPenalties.isEmpty {
                Text("Ручных штрафов нет").foregroundStyle(.secondary).frame(maxWidth: .infinity).padding(.vertical, 16)
            }
            ForEach(s.manualPenalties.reversed()) { p in
                Card {
                    HStack(spacing: 10) {
                        Text(store.child(p.childId)?.avatar ?? "?").font(.title3)
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 6) {
                                Text(store.child(p.childId)?.name ?? "?").font(.subheadline.weight(.medium))
                                Pill(text: "−\(p.amount) баллов", color: Theme.red)
                            }
                            Text(p.reason).font(.subheadline).foregroundStyle(.secondary)
                            Text(RuDate.dottedFromISO(p.createdAt)).font(.caption2).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Button { store.removeManualPenalty(p.id) } label: { Text("✕").foregroundStyle(.secondary) }.buttonStyle(.plain)
                    }
                }
            }
        }
    }

    // MARK: actions

    private func addReward() {
        guard !rTitle.trimmingCharacters(in: .whitespaces).isEmpty else { rError = "Введите название"; return }
        store.addReward(title: rTitle.trimmingCharacters(in: .whitespaces), description: rDesc, cost: rCost, oneTime: rOneTime)
        rTitle = ""; rDesc = ""; rCost = 50; rOneTime = false; rError = ""; showRewardForm = false
    }

    private func addPenalty() {
        guard !pChildId.isEmpty else { pError = "Выберите ребёнка"; return }
        guard !pReason.trimmingCharacters(in: .whitespaces).isEmpty else { pError = "Укажите причину"; return }
        guard pAmount > 0 else { pError = "Сумма должна быть больше 0"; return }
        store.addManualPenalty(childId: pChildId, amount: pAmount, reason: pReason.trimmingCharacters(in: .whitespaces), forDate: nil)
        pChildId = ""; pAmount = 10; pReason = ""; pError = ""; showPenaltyForm = false
    }

    // MARK: helpers

    private func claimTitle(_ c: RewardClaim) -> String {
        c.rewardTitle ?? s.rewards.first { $0.id == c.rewardId }?.title ?? "?"
    }
    private func claimCost(_ c: RewardClaim) -> Int {
        c.rewardCost ?? s.rewards.first { $0.id == c.rewardId }?.cost ?? 0
    }

    @ViewBuilder private func labeled<V: View>(_ label: String, @ViewBuilder _ content: () -> V) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            content()
        }
    }

    private var cardBG: Color {
        #if os(iOS)
        Color(.secondarySystemGroupedBackground)
        #else
        Color(nsColor: .controlBackgroundColor)
        #endif
    }
}
