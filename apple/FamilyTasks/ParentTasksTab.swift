import SwiftUI

// Create / edit / remove tasks + approve child task suggestions.
// Mirrors parent/TasksTab.tsx.
struct ParentTasksTab: View {
    @EnvironmentObject var store: Store

    @State private var form = ParentTasksTab.emptyForm()
    @State private var editingTaskId: String?
    @State private var showForm = false
    @State private var error = ""

    private static let recurrenceOptions: [(value: String, label: String, hint: String)] = [
        ("once", "Один раз", "Выполнить однажды за весь период (напр. прочитать книгу)"),
        ("daily", "Каждый день", "Выполнять каждый день периода"),
        ("weekdays", "По будням", "Пн–Пт каждой недели (напр. домашняя работа)"),
        ("specific_days", "По выбранным дням", "Только выбранные дни недели (напр. тренировки)"),
    ]

    static func emptyForm() -> TaskItem {
        TaskItem(id: "", title: "", description: "", reward: 10, penalty: 0, assignedTo: [],
                 startDate: Logic.todayStr(), endDate: ParentTasksTab.plusDays(7), recurrence: "daily",
                 specificDays: [], reportAtEnd: false, rewardHistory: nil, penaltyHistory: nil,
                 pendingApproval: nil, suggestedBy: nil)
    }

    var body: some View {
        VStack(spacing: 16) {
            if !store.pendingTaskSuggestions.isEmpty { suggestionsSection }
            if showForm { formCard } else {
                PrimaryButton(title: "+ Новое задание", color: Theme.indigo) {
                    form = Self.emptyForm(); editingTaskId = nil; error = ""; showForm = true
                }
            }
            taskList
        }
    }

    // MARK: suggestions

    private var suggestionsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Предложения детей").font(.headline)
            ForEach(store.pendingTaskSuggestions) { t in
                let child = t.suggestedBy.flatMap { store.child($0) }
                Card {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(alignment: .top, spacing: 8) {
                            Text(child?.avatar ?? "👤").font(.system(size: 26))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(t.title).font(.headline)
                                if !t.description.isEmpty { Text(t.description).font(.subheadline).foregroundStyle(.secondary) }
                                Text("предложил(а) \(child?.name ?? "")").font(.caption).foregroundStyle(Theme.indigo)
                            }
                            Spacer()
                        }
                        HStack(spacing: 8) {
                            Button("Отклонить") { store.removeTask(t.id) }
                                .padding(.horizontal, 12).padding(.vertical, 8)
                                .background(Color.gray.opacity(0.15)).clipShape(RoundedRectangle(cornerRadius: 10)).buttonStyle(.plain)
                            Button("Настроить и одобрить") { openEdit(t) }
                                .fontWeight(.semibold).frame(maxWidth: .infinity).padding(.vertical, 8)
                                .background(Theme.indigo).foregroundStyle(.white).clipShape(RoundedRectangle(cornerRadius: 10)).buttonStyle(.plain)
                        }
                    }
                }
                .overlay(RoundedRectangle(cornerRadius: 18).stroke(Theme.indigo.opacity(0.3)))
            }
        }
    }

    // MARK: form

    private var isRecurring: Bool { form.recurrence != "once" }

    private var formCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Text(editingTaskId != nil ? "Редактировать задание" : "Новое задание").font(.headline)
                    Spacer()
                    Button { closeForm() } label: { Text("✕").foregroundStyle(.secondary) }.buttonStyle(.plain)
                }
                field("Название *") {
                    TextField("например, Домашняя работа", text: $form.title).textFieldStyle(.roundedBorder)
                        .onChange(of: form.title) { error = "" }
                }
                field("Описание") {
                    TextField("Дополнительные детали...", text: $form.description, axis: .vertical)
                        .lineLimit(2...4).textFieldStyle(.roundedBorder)
                }
                recurrencePicker
                if form.recurrence == "specific_days" { dayPicker }
                if isRecurring { reportModePicker }
                datesRow
                pointsRow
                assignRow
                if !error.isEmpty { Text(error).font(.footnote).foregroundStyle(Theme.red) }
                PrimaryButton(title: editingTaskId != nil ? "Сохранить изменения" : "Создать задание", color: Theme.indigo, action: save)
            }
        }
    }

    private var recurrencePicker: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Повторение").font(.caption).foregroundStyle(.secondary)
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                ForEach(Self.recurrenceOptions, id: \.value) { opt in
                    Button {
                        form.recurrence = opt.value
                        if opt.value == "once" { form.reportAtEnd = false }
                        error = ""
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(opt.label).font(.subheadline.weight(.medium))
                                .foregroundStyle(form.recurrence == opt.value ? Theme.indigo : .primary)
                            Text(opt.hint).font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.leading)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading).padding(10)
                        .overlay(RoundedRectangle(cornerRadius: 12)
                            .stroke(form.recurrence == opt.value ? Theme.indigo : Color.gray.opacity(0.3), lineWidth: 2))
                        .background(form.recurrence == opt.value ? Theme.indigo.opacity(0.08) : .clear)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var dayPicker: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Дни недели *").font(.caption).foregroundStyle(.secondary)
            HStack(spacing: 6) {
                ForEach(Logic.dowOrder, id: \.self) { dow in
                    Button { toggleDay(dow); error = "" } label: {
                        Text(Logic.dowLabels[dow] ?? "")
                            .font(.subheadline.weight(.medium)).frame(maxWidth: .infinity).padding(.vertical, 8)
                            .background(form.specificDays.contains(dow) ? Theme.indigo : Color.clear)
                            .foregroundStyle(form.specificDays.contains(dow) ? .white : .secondary)
                            .overlay(RoundedRectangle(cornerRadius: 10)
                                .stroke(form.specificDays.contains(dow) ? Theme.indigo : Color.gray.opacity(0.3), lineWidth: 2))
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var reportModePicker: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Способ выполнения").font(.caption).foregroundStyle(.secondary)
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                reportOption(title: "Отмечать каждый раз", hint: "Ребёнок отмечает выполнение каждый день", value: false)
                reportOption(title: "Отчитаться в конце", hint: "Одна отметка за весь период", value: true)
            }
        }
    }

    private func reportOption(title: String, hint: String, value: Bool) -> some View {
        Button { form.reportAtEnd = value } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.medium))
                    .foregroundStyle(form.reportAtEnd == value ? Theme.indigo : .primary)
                Text(hint).font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.leading)
            }
            .frame(maxWidth: .infinity, alignment: .leading).padding(10)
            .overlay(RoundedRectangle(cornerRadius: 12)
                .stroke(form.reportAtEnd == value ? Theme.indigo : Color.gray.opacity(0.3), lineWidth: 2))
            .background(form.reportAtEnd == value ? Theme.indigo.opacity(0.08) : .clear)
        }
        .buttonStyle(.plain)
    }

    private var datesRow: some View {
        HStack(spacing: 12) {
            field("Начало") {
                DatePicker("", selection: dateBinding($form.startDate), displayedComponents: .date).labelsHidden()
            }
            field("Конец") {
                DatePicker("", selection: dateBinding($form.endDate), displayedComponents: .date).labelsHidden()
            }
        }
    }

    private var pointsRow: some View {
        HStack(spacing: 12) {
            field("Награда (баллы)") { IntField(placeholder: "0", value: $form.reward) }
            field("Штраф за пропуск") { IntField(placeholder: "0 = нет штрафа", value: $form.penalty) }
        }
    }

    private var assignRow: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Назначить *").font(.caption).foregroundStyle(.secondary)
            if store.state.children.isEmpty {
                Text("Сначала добавьте детей").font(.subheadline).foregroundStyle(.secondary)
            } else {
                FlowChips(store.state.children.map { ($0.id, "\($0.avatar) \($0.name)") },
                          isOn: { form.assignedTo.contains($0) }) { toggleChild($0); error = "" }
            }
        }
    }

    // MARK: task list

    private var taskList: some View {
        let active = store.state.tasks.filter { $0.pendingApproval != true }
        return VStack(spacing: 12) {
            if active.isEmpty {
                Text("Заданий пока нет").foregroundStyle(.secondary).frame(maxWidth: .infinity).padding(.vertical, 20)
            }
            ForEach(active) { task in taskRow(task) }
        }
    }

    private func taskRow(_ task: TaskItem) -> some View {
        Card {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 6) {
                        Text(task.title).font(.headline)
                        if task.reward > 0 { Pill(text: "+\(task.reward) ⭐", color: Theme.yellow) }
                        if task.penalty > 0 { Pill(text: "−\(task.penalty) штраф", color: Theme.red) }
                    }
                    if let by = task.suggestedBy, let c = store.child(by) {
                        Pill(text: "идея \(c.avatar) \(c.name)", color: Theme.green)
                    }
                    if !task.description.isEmpty { Text(task.description).font(.subheadline).foregroundStyle(.secondary) }
                    HStack(spacing: 6) {
                        Pill(text: Logic.recurrenceLabel(task), color: .blue)
                        if task.recurrence != "once" {
                            Pill(text: task.reportAtEnd ? "Отчёт в конце" : "Каждый раз", color: .gray)
                        }
                    }
                    Text("\(RuDate.dayMonthYear(task.startDate)) → \(RuDate.dayMonthYear(task.endDate))")
                        .font(.caption2).foregroundStyle(.secondary)
                    if !task.assignedTo.isEmpty {
                        FlowChips(task.assignedTo.map { id in (id, "\(store.child(id)?.avatar ?? "") \(store.child(id)?.name ?? "?")") },
                                  isOn: { _ in false }, tappable: false) { _ in }
                    }
                }
                Spacer()
                VStack(spacing: 8) {
                    Button { openEdit(task) } label: { Text("✏️") }.buttonStyle(.plain)
                    Button { store.removeTask(task.id) } label: { Text("✕").foregroundStyle(.secondary) }.buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: actions

    private func toggleDay(_ dow: Int) {
        if let i = form.specificDays.firstIndex(of: dow) { form.specificDays.remove(at: i) } else { form.specificDays.append(dow) }
    }
    private func toggleChild(_ id: String) {
        if let i = form.assignedTo.firstIndex(of: id) { form.assignedTo.remove(at: i) } else { form.assignedTo.append(id) }
    }
    private func openEdit(_ task: TaskItem) {
        form = task; editingTaskId = task.id; showForm = true; error = ""
    }
    private func closeForm() {
        showForm = false; editingTaskId = nil; form = Self.emptyForm(); error = ""
    }
    private func save() {
        guard !form.title.trimmingCharacters(in: .whitespaces).isEmpty else { error = "Введите название задания"; return }
        guard !form.assignedTo.isEmpty else { error = "Назначьте хотя бы одному ребёнку"; return }
        guard form.startDate <= form.endDate else { error = "Дата окончания должна быть позже даты начала"; return }
        if form.recurrence == "specific_days" && form.specificDays.isEmpty { error = "Выберите хотя бы один день недели"; return }
        if let id = editingTaskId {
            var t = form; t.pendingApproval = false
            store.editTask(id, t)
        } else {
            store.addTask(form)
        }
        closeForm()
    }

    // MARK: helpers

    @ViewBuilder private func field<V: View>(_ label: String, @ViewBuilder _ content: () -> V) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private static let ymd: DateFormatter = {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"; return f
    }()
    private static func plusDays(_ n: Int) -> String {
        let u = DateFormatter(); u.locale = Locale(identifier: "en_US_POSIX"); u.timeZone = TimeZone(identifier: "UTC"); u.dateFormat = "yyyy-MM-dd"
        return u.string(from: Date().addingTimeInterval(TimeInterval(n) * 86_400))
    }
    private func dateBinding(_ s: Binding<String>) -> Binding<Date> {
        Binding<Date>(
            get: {
                let p = s.wrappedValue.split(separator: "-")
                guard p.count == 3, let y = Int(p[0]), let m = Int(p[1]), let d = Int(p[2]) else { return Date() }
                var c = DateComponents(); c.year = y; c.month = m; c.day = d; c.hour = 12
                return Calendar.current.date(from: c) ?? Date()
            },
            set: { s.wrappedValue = Self.ymd.string(from: $0) }
        )
    }
}

// Simple wrapping chip row used for child assignment.
struct FlowChips: View {
    let items: [(String, String)]
    var isOn: (String) -> Bool
    var tappable: Bool = true
    var onTap: (String) -> Void

    init(_ items: [(String, String)], isOn: @escaping (String) -> Bool, tappable: Bool = true, onTap: @escaping (String) -> Void) {
        self.items = items; self.isOn = isOn; self.tappable = tappable; self.onTap = onTap
    }

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 90), spacing: 6)], alignment: .leading, spacing: 6) {
            ForEach(items, id: \.0) { item in
                let on = isOn(item.0)
                Button { if tappable { onTap(item.0) } } label: {
                    Text(item.1).font(.caption).lineLimit(1)
                        .padding(.horizontal, 10).padding(.vertical, 6)
                        .background(on ? Theme.indigo.opacity(0.12) : Color.gray.opacity(0.1))
                        .foregroundStyle(on ? Theme.indigo : .secondary)
                        .overlay(Capsule().stroke(on ? Theme.indigo : Color.clear, lineWidth: 1.5))
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain).disabled(!tappable)
            }
        }
    }
}
