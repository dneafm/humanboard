@echo off
cd /d F:\backtest\comic-engine
.venv\Scripts\python.exe -c "from bearer_gpt_image2_helper import BearerGPTImage2Helper; helper = BearerGPTImage2Helper(); img = helper.generate_image('a simple stick figure'); print('SUCCESS:', len(img))"
