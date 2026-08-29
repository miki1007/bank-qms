import SwiftUI

@main
struct BankQMSStaffApp: App {
    var body: some Scene {
        WindowGroup {
            SecureWebApp(title: "Bank QMS Staff", accent: Color(red: 0.22, green: 0.42, blue: 0.71))
        }
    }
}
