#!/bin/bash
#sed 's/registerLanguage("/&\n/g' highlight.pack.js | sed 's/".*//' | sed '1d' | sort

if [ -z "$1" ] ; then
  echo "Usage: $0 <file>"
  exit 1
fi

listall() {
  egrep -o 'registerLanguage\("[^"]+"' $1 | sed 's/registerLanguage("\(.*\)"/\1/' | sort
}
listall $1

echo -e "\n\n~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~"
echo "Not in options/languages-list_all.json :"
echo "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~"
grep -vx -f <(sed 's/^"\([^"]*\)".*/\1/' options/languages-list_all.json ) <(listall $1)
