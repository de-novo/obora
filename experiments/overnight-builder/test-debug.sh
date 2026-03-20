#!/bin/bash
cd workspace
npm test 2>&1 | head -100
