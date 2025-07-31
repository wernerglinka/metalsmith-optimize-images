#!/bin/bash
export GH_TOKEN=$(gh auth token)
npx release-it $1 $2