import {NextRequest, NextResponse} from "next/server";
import {createErrorResponse, getPluginSettingsFromRequest, PluginErrorType} from "@lobehub/chat-plugin-sdk";
import {OneCompilerRequestBody, OneCompilerResponse, Settings} from "@/type";
import axios from "axios";

const ONECOMPILER_API_URL = 'https://onecompiler-apis.p.rapidapi.com/api/v1/run';
// 从环境变量获取验证密钥
const AUTH_KEY = process.env.PLUGIN_AUTH_KEY;

export async function POST(req: NextRequest) {
	try {
		// 获取插件设置
		let settings = getPluginSettingsFromRequest<Settings>(req);
		if (!settings)
			return createErrorResponse(PluginErrorType.PluginSettingsInvalid, {
				message: '插件设置未找到。',
			});

		// 验证插件API密钥
		const clientApiKey = settings.PLUGIN_API_KEY;
		if (!clientApiKey) {
			return createErrorResponse(PluginErrorType.PluginSettingsInvalid, {
				message: '未提供插件API密钥。',
			});
		}
		
		// 检查环境变量中是否配置了验证密钥
		if (!AUTH_KEY) {
			console.error('服务器未配置环境变量PLUGIN_AUTH_KEY');
			return NextResponse.json({
				error: '服务器身份验证配置错误'
			}, { status: 500 });
		}
		
		// 检查客户端提供的密钥是否与环境变量中的匹配
		if (clientApiKey !== AUTH_KEY) {
			console.log('无效的API密钥：客户端密钥与服务器不匹配');
			return NextResponse.json({
				error: '无效的API密钥，身份验证失败'
			}, { status: 401 });
		}

		const rapidApiKey = settings.RAPIDAPI_KEY;
		if (!rapidApiKey) {
			return createErrorResponse(PluginErrorType.PluginSettingsInvalid, {
				message: 'RapidAPI Key未在设置中提供。',
			});
		}

		const body = await req.json();
		const { code, language = settings.CODE_LANGUAGE || 'python', stdin = '' } = body;
		
		if (!code) {
			return createErrorResponse(PluginErrorType.PluginSettingsInvalid, {
				message: '代码内容是必需的。',
			  });
		}

		// 构建OneCompiler请求
		const oneCompilerRequest: OneCompilerRequestBody = {
			language,
			stdin,
			files: [
				{
					name: `index.${language === 'javascript' ? 'js' : language}`,
					content: code
				}
			]
		};

		// 调用OneCompiler API
		const response = await axios.post(
			ONECOMPILER_API_URL,
			oneCompilerRequest,
			{
				headers: {
					'X-RapidAPI-Host': 'onecompiler-apis.p.rapidapi.com',
					'X-RapidAPI-Key': rapidApiKey,
					'Content-Type': 'application/json',
				}
			}
		);

		if (response.status !== 200) {
			if (response.status === 401 || response.status === 403) {
				return createErrorResponse(PluginErrorType.PluginSettingsInvalid, {
					message: '无效的RapidAPI密钥。'
				});
			}
			console.error('代码执行失败:', response.data);
			return NextResponse.json({
				error: '代码执行失败。'
			}, { status: 500 });
		}

		const result: OneCompilerResponse = response.data;
		
		// 构建Markdown格式的响应
		let markdownResponse = `## 代码执行结果\n\n`;
		
		markdownResponse += `**语言**: ${language}\n`;
		markdownResponse += `**状态**: ${result.status}\n`;
		markdownResponse += `**执行时间**: ${result.executionTime}ms\n\n`;
		
		if (stdin) {
			markdownResponse += `### 输入\n\`\`\`\n${stdin}\n\`\`\`\n\n`;
		}
		
		if (result.stdout) {
			markdownResponse += `### 标准输出\n\`\`\`\n${result.stdout}\n\`\`\`\n\n`;
		}
		
		if (result.stderr) {
			markdownResponse += `### 标准错误\n\`\`\`\n${result.stderr}\n\`\`\`\n\n`;
		}
		
		if (result.exception) {
			markdownResponse += `### 异常\n\`\`\`\n${result.exception}\n\`\`\`\n\n`;
		}

		// 返回执行结果
		return NextResponse.json({ markdownResponse });
	} catch (error) {
		console.error('代码执行错误:', error);
		return NextResponse.json({
			error: '代码执行失败。'
		}, { status: 500 });
	}
}