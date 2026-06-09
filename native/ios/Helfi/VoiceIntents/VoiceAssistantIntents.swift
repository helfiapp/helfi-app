import AppIntents
import Foundation
import UIKit

@available(iOS 16.0, *)
fileprivate func helfiVoiceURL(intent: String, request: String) throws -> URL {
  var components = URLComponents()
  components.scheme = "helfi"
  components.host = "voice"
  components.queryItems = [
    URLQueryItem(name: "source", value: "siri"),
    URLQueryItem(name: "intent", value: intent),
    URLQueryItem(name: "text", value: request)
  ]
  guard let url = components.url else {
    throw HelfiVoiceIntentError.invalidURL
  }
  return url
}

@available(iOS 16.0, *)
@MainActor
fileprivate func openHelfiVoice(intent: String, request: String) throws {
  UIApplication.shared.open(try helfiVoiceURL(intent: intent, request: request))
}

@available(iOS 16.0, *)
enum HelfiVoiceIntentError: Error {
  case invalidURL
}

@available(iOS 16.0, *)
struct AskHelfiIntent: AppIntent {
  static var title: LocalizedStringResource = "Ask Helfi"
  static var description = IntentDescription("Open Helfi with a spoken request ready to review.")
  static var openAppWhenRun = true

  @Parameter(title: "Request")
  var request: String

  static var parameterSummary: some ParameterSummary {
    Summary("Ask Helfi \(\.$request)")
  }

  func perform() async throws -> some IntentResult {
    try await openHelfiVoice(intent: "ask", request: request)
    return .result()
  }
}

@available(iOS 16.0, *)
struct LogExerciseWithHelfiIntent: AppIntent {
  static var title: LocalizedStringResource = "Log exercise with Helfi"
  static var description = IntentDescription("Open Helfi with an exercise request ready to confirm.")
  static var openAppWhenRun = true

  @Parameter(title: "Exercise")
  var request: String

  static var parameterSummary: some ParameterSummary {
    Summary("Log exercise with Helfi \(\.$request)")
  }

  func perform() async throws -> some IntentResult {
    try await openHelfiVoice(intent: "exercise", request: request)
    return .result()
  }
}

@available(iOS 16.0, *)
struct AddMoodWithHelfiIntent: AppIntent {
  static var title: LocalizedStringResource = "Add mood with Helfi"
  static var description = IntentDescription("Open Helfi with a mood request ready to confirm.")
  static var openAppWhenRun = true

  @Parameter(title: "Mood")
  var request: String

  static var parameterSummary: some ParameterSummary {
    Summary("Add mood with Helfi \(\.$request)")
  }

  func perform() async throws -> some IntentResult {
    try await openHelfiVoice(intent: "mood", request: request)
    return .result()
  }
}

@available(iOS 16.0, *)
struct AddJournalNoteWithHelfiIntent: AppIntent {
  static var title: LocalizedStringResource = "Add journal note with Helfi"
  static var description = IntentDescription("Open Helfi with a journal note ready to confirm.")
  static var openAppWhenRun = true

  @Parameter(title: "Journal note")
  var request: String

  static var parameterSummary: some ParameterSummary {
    Summary("Add journal note with Helfi \(\.$request)")
  }

  func perform() async throws -> some IntentResult {
    try await openHelfiVoice(intent: "journal", request: request)
    return .result()
  }
}

@available(iOS 16.0, *)
struct HelfiVoiceShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: AskHelfiIntent(),
      phrases: [
        "Ask \(.applicationName)"
      ],
      shortTitle: "Ask Helfi",
      systemImageName: "mic"
    )

    AppShortcut(
      intent: LogExerciseWithHelfiIntent(),
      phrases: [
        "Log exercise with \(.applicationName)"
      ],
      shortTitle: "Log exercise",
      systemImageName: "figure.walk"
    )

    AppShortcut(
      intent: AddMoodWithHelfiIntent(),
      phrases: [
        "Add mood with \(.applicationName)"
      ],
      shortTitle: "Add mood",
      systemImageName: "heart"
    )

    AppShortcut(
      intent: AddJournalNoteWithHelfiIntent(),
      phrases: [
        "Add journal note with \(.applicationName)"
      ],
      shortTitle: "Add journal",
      systemImageName: "book"
    )
  }
}
