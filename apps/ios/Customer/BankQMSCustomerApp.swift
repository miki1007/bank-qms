import SwiftUI

@main
struct BankQMSCustomerApp: App {
    var body: some Scene {
        WindowGroup {
            SecureWebApp(title: "Bank QMS Customer", accent: Color(red: 0.04, green: 0.39, blue: 0.30))
        }
    }
}
