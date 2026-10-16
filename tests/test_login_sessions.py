import unittest
from unittest.mock import Mock

from login_sessions import LoginSessions, SessionUnavailable


class LoginSessionTests(unittest.TestCase):
    def setUp(self):
        self.now = 0
        self.manager = LoginSessions(ttl=10, clock=lambda: self.now)
        self.driver = Mock()

    def tearDown(self):
        self.manager.close_all()

    def start(self):
        sid = self.manager.reserve(3)
        self.manager.attach(sid, self.driver)
        return sid

    def test_cancel_releases_browser(self):
        sid = self.start()
        self.manager.cancel(sid)
        self.manager.cancel(sid)
        self.driver.quit.assert_called_once()

    def test_expiry_releases_browser(self):
        self.start()
        self.now = 11
        self.manager.expire()
        self.driver.quit.assert_called_once()
        self.assertFalse(self.manager.sessions)

    def test_cancel_before_driver_creation_closes_late_driver(self):
        sid = self.manager.reserve(3)
        self.manager.cancel(sid)
        with self.assertRaises(SessionUnavailable):
            self.manager.attach(sid, self.driver)
        self.driver.quit.assert_called_once()

    def test_cancel_before_start_request_arrives_is_remembered(self):
        self.manager.cancel('late-request')
        with self.assertRaises(SessionUnavailable):
            self.manager.reserve(3, 'late-request')

    def test_cancel_during_validation_prevents_commit_and_defers_quit(self):
        sid = self.start()
        commit = Mock()
        with self.manager.claim(sid):
            self.manager.cancel(sid)
            self.driver.quit.assert_not_called()
            with self.assertRaises(SessionUnavailable):
                self.manager.complete(sid, commit)
        commit.assert_not_called()
        self.driver.quit.assert_called_once()

    def test_success_commits_once_and_releases_browser(self):
        sid = self.start()
        commit = Mock()
        with self.manager.claim(sid):
            self.manager.complete(sid, commit)
        commit.assert_called_once_with(3)
        self.driver.quit.assert_called_once()

    def test_duplicate_confirmation_is_rejected(self):
        sid = self.start()
        with self.manager.claim(sid):
            with self.assertRaises(SessionUnavailable):
                with self.manager.claim(sid):
                    self.fail('duplicate claim')


if __name__ == '__main__':
    unittest.main()
