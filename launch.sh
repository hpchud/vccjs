#!/bin/sh

# the vcc daemon/tool launcher script

if test "$1" = 'tool'; then
	/vccjs/tool.js $@
else
	/init8js/init.js $@
fi