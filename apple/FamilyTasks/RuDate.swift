import Foundation

// Russian-locale date formatting, mirroring the web's
// `new Date(...).toLocaleDateString('ru-RU', {...})` calls. Inputs are either
// "yyyy-MM-dd" day strings (parsed at local noon to avoid TZ rollover) or full
// ISO-8601 timestamps. Display only — never used for logic or re-encoding.
enum RuDate {
    private static let ru = Locale(identifier: "ru_RU")
    private static let cal: Calendar = {
        var c = Calendar(identifier: .gregorian); c.timeZone = .current; return c
    }()

    private static func dateFromYMD(_ ymd: String) -> Date? {
        let p = ymd.split(separator: "-")
        guard p.count == 3, let y = Int(p[0]), let m = Int(p[1]), let d = Int(p[2]) else { return nil }
        var c = DateComponents(); c.year = y; c.month = m; c.day = d; c.hour = 12
        return cal.date(from: c)
    }

    private static let isoFrac: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f
    }()
    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime]; return f
    }()
    private static func dateFromISO(_ s: String) -> Date? { isoFrac.date(from: s) ?? iso.date(from: s) }

    private static func fmt(_ pattern: String) -> DateFormatter {
        let f = DateFormatter(); f.locale = ru; f.calendar = cal; f.timeZone = .current
        f.dateFormat = pattern; return f
    }
    private static let fWeekdayDayMonth = fmt("EE, d MMM")     // "пт, 5 сент."
    private static let fDayMonthShort   = fmt("d MMM")          // "5 сент."
    private static let fDayMonthYear    = fmt("d MMM yyyy")     // "5 сент. 2026"
    private static let fDayMonthLong    = fmt("d MMMM yyyy")    // "5 сентября 2026"
    private static let fDotted          = fmt("dd.MM.yyyy")     // "05.09.2026"
    private static let fWeekdayLong     = fmt("EEEE, d MMMM")   // "пятница, 5 сентября"

    // From "yyyy-MM-dd"
    static func weekdayDayMonth(_ ymd: String) -> String {
        dateFromYMD(ymd).map { fWeekdayDayMonth.string(from: $0) } ?? ymd
    }
    static func dayMonthShort(_ ymd: String) -> String {
        dateFromYMD(ymd).map { fDayMonthShort.string(from: $0) } ?? ymd
    }
    static func dayMonthYear(_ ymd: String) -> String {
        dateFromYMD(ymd).map { fDayMonthYear.string(from: $0) } ?? ymd
    }

    // From full ISO-8601 timestamp
    static func longFromISO(_ isoString: String) -> String {
        dateFromISO(isoString).map { fDayMonthLong.string(from: $0) } ?? isoString
    }
    static func dottedFromISO(_ isoString: String) -> String {
        dateFromISO(isoString).map { fDotted.string(from: $0) } ?? isoString
    }

    // "now" header line: "пятница, 5 сентября"
    static func weekdayLongToday() -> String { fWeekdayLong.string(from: Date()) }
}
