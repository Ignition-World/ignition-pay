import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  var secureOverlay: UIView?
  var isSecureScreenActive = false

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    let controller : FlutterViewController = window?.rootViewController as! FlutterViewController
    let secureChannel = FlutterMethodChannel(name: "com.ignitionpay/secure",
                                              binaryMessenger: controller.binaryMessenger)
    secureChannel.setMethodCallHandler({
      [weak self] (call: FlutterMethodCall, result: @escaping FlutterResult) -> Void in
      if call.method == "secureScreen" {
         self?.isSecureScreenActive = true
         NotificationCenter.default.addObserver(self!, selector: #selector(self!.handleScreenCapture), name: UIScreen.capturedDidChangeNotification, object: nil)
         self?.handleScreenCapture()
         result(nil)
      } else if call.method == "unsecureScreen" {
         self?.isSecureScreenActive = false
         NotificationCenter.default.removeObserver(self!, name: UIScreen.capturedDidChangeNotification, object: nil)
         self?.secureOverlay?.removeFromSuperview()
         result(nil)
      } else {
        result(FlutterMethodNotImplemented)
      }
    })
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  @objc func handleScreenCapture() {
      if UIScreen.main.isCaptured && isSecureScreenActive {
          if secureOverlay == nil {
              secureOverlay = UIView(frame: UIScreen.main.bounds)
              secureOverlay?.backgroundColor = UIColor.black
              let label = UILabel(frame: secureOverlay!.bounds)
              label.text = "Screen recording disabled"
              label.textColor = .white
              label.textAlignment = .center
              secureOverlay?.addSubview(label)
          }
          if let window = self.window {
              window.addSubview(secureOverlay!)
          }
      } else {
          secureOverlay?.removeFromSuperview()
      }
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
  }
}
