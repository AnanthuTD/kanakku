package expo.modules.kanakku

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class DriveBackupCryptoTest {
  @Test fun encryptedArchiveRoundTripsWithRecoveryPassword() {
    val original = """{"format":"kanakku-journal","version":1,"transactions":[],"rules":[]}"""
    val encrypted = BackupCrypto.encrypt(original, "correct horse battery staple")
    assertEquals(original, BackupCrypto.decrypt(encrypted, "correct horse battery staple"))
    assertThrows(IllegalArgumentException::class.java) {
      BackupCrypto.decrypt(encrypted, "wrong horse battery staple")
    }
  }

  @Test fun rejectsTamperedCiphertextAndWeakPasswords() {
    assertThrows(IllegalArgumentException::class.java) {
      BackupCrypto.encrypt("{}", "short")
    }
    val encrypted = BackupCrypto.encrypt("{}", "correct horse battery staple")
    val tampered = encrypted.replace("ciphertext\":\"", "ciphertext\":\"A")
    assertThrows(Exception::class.java) {
      BackupCrypto.decrypt(tampered, "correct horse battery staple")
    }
  }
}
