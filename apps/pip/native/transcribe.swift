import Foundation
import Speech

func emit(_ payload: [String: Any]) {
    guard JSONSerialization.isValidJSONObject(payload),
          let data = try? JSONSerialization.data(withJSONObject: payload),
          let line = String(data: data, encoding: .utf8) else { return }
    print(line)
    fflush(stdout)
}

guard CommandLine.arguments.count > 1 else {
    emit(["type": "error", "code": "missing-file"])
    exit(1)
}

let fileURL = URL(fileURLWithPath: CommandLine.arguments[1])
let localeId = CommandLine.arguments.count > 2 ? CommandLine.arguments[2] : Locale.current.identifier
var finished = false

func shutdown() {
    if finished { return }
    finished = true
    CFRunLoopStop(CFRunLoopGetMain())
}

SFSpeechRecognizer.requestAuthorization { status in
    DispatchQueue.main.async {
        guard status == .authorized else {
            emit(["type": "error", "code": "speech-not-authorized"])
            shutdown()
            return
        }
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: localeId)),
              recognizer.isAvailable else {
            emit(["type": "error", "code": "recognizer-unavailable"])
            shutdown()
            return
        }

        let request = SFSpeechURLRecognitionRequest(url: fileURL)
        request.shouldReportPartialResults = false
        recognizer.recognitionTask(with: request) { result, error in
            if let result = result, result.isFinal {
                let text = result.bestTranscription.formattedString
                if text.isEmpty {
                    emit(["type": "error", "code": "empty"])
                } else {
                    emit(["type": "final", "text": text])
                }
                shutdown()
            } else if error != nil {
                emit(["type": "error", "code": "transcribe-failed"])
                shutdown()
            }
        }
    }
}

RunLoop.main.run()
