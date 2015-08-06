#!/usr/bin/python
import sys
import os

from twisted.internet import stdio, reactor
from twisted.protocols import basic

class Echo(basic.LineReceiver):
    from os import linesep as delimiter

    def exitWithStatusCode(self):
        print 'trying to exit'
        if self.all_good:
            os._exit(0)
        else:
            os._exit(1)

    def _done(self):
        print 'in _done'
        os.system('killall -9 node')
        reactor.removeAll()
        reactor.stop()

    def connectionMade(self):
        self.all_good = True

    def lineReceived(self, line):
        self.sendLine(line)

        if 'FAIL' in line:
            self.all_good = False
            self.sendLine("NOTICED A FAILURE!")
            reactor.callLater(0.1, self._done)
            print 'called later'

        if 'time to exit' in line:
            reactor.callLater(0.1, self._done)

def main():
    e = Echo()
    stdio.StandardIO(e)
    from twisted.internet import reactor
    reactor.run()
    e.exitWithStatusCode()


if __name__ == '__main__':
    main()
