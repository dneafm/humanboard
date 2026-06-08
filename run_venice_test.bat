@echo off
cd /d F:\backtest\comic-engine
.venv\Scripts\python.exe -c "from venice_helper import VeniceHelper; helper = VeniceHelper(); img = helper.generate_image('a simple stick figure'); print('SUCCESS:', len(img))"
