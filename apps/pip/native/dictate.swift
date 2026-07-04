import AVFoundation
import Foundation
import Speech

func emit(_ payload: [String: Any]) {
    guard JSONSerialization.isValidJSONObject(payload),
          let data = try? JSONSerialization.data(withJSONObject: payload),
          let line = String(data: data, encoding: .utf8) else { return }
    print(line)
    fflush(stdout)
}

let localeId = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : Locale.current.identifier
let maxSeconds = CommandLine.arguments.count > 2 ? Double(CommandLine.arguments[2]) ?? 45 : 45

var shouldStop = false
signal(SIGTERM) { _ in shouldStop = true }
signal(SIGINT) { _ in shouldStop = true }

var audioEngine: AVAudioEngine?
var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
var recognitionTask: SFSpeechRecognitionTask?
var finished = false
var lastText = ""

func shutdown() {
    if finished { return }
    finished = true
    if !lastText.isEmpty {
        emit(["type": "final", "text": lastText])
    }
    recognitionTask?.cancel()
    recognitionTask = nil
    if let engine = audioEngine {
        engine.stop()
        engine.inputNode.removeTap(onBus: 0)
    }
    audioEngine = nil
    recognitionRequest?.endAudio()
    recognitionRequest = nil
    CFRunLoopStop(CFRunLoopGetMain())
}

func start() {
    SFSpeechRecognizer.requestAuthorization { status in
        DispatchQueue.main.async {
            guard status == .authorized else {
                emit(["type": "error", "code": "speech-not-authorized"])
                shutdown()
                return
            }

            AVCaptureDevice.requestAccess(for: .audio) { micOk in
                DispatchQueue.main.async {
                    guard micOk else {
                        emit(["type": "error", "code": "mic-not-authorized"])
                        shutdown()
                        return
                    }

                    guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: localeId)),
                          recognizer.isAvailable else {
                        emit(["type": "error", "code": "recognizer-unavailable"])
                        shutdown()
                        return
                    }

                    let engine = AVAudioEngine()
                    let request = SFSpeechAudioBufferRecognitionRequest()
                    request.shouldReportPartialResults = true
                    audioEngine = engine
                    recognitionRequest = request

                    let input = engine.inputNode
                    let format = input.outputFormat(forBus: 0)
                    input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
                        request.append(buffer)
                    }

                    do {
                        try engine.start()
                    } catch {
                        emit(["type": "error", "code": "engine-start-failed"])
                        shutdown()
                        return
                    }

                    emit(["type": "ready"])

                    recognitionTask = recognizer.recognitionTask(with: request) { result, error in
                        if let result = result {
                            lastText = result.bestTranscription.formattedString
                            emit(["type": "partial", "text": lastText])
                            if result.isFinal {
                                shutdown()
                            }
                        } else if error != nil {
                            shutdown()
                        }
                    }

                    DispatchQueue.main.asyncAfter(deadline: .now() + maxSeconds) {
                        if !finished { shutdown() }
                    }
                }
            }
        }
    }
}

start()
RunLoop.main.run()
