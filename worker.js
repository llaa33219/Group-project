// worker.js

// HTML 문자열 내의 특수문자를 이스케이프하는 함수 (디버깅용)
function escapeHtml(html) {
  return html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// 프로젝트 페이지에서 직접 프로젝트 정보 추출
async function extractProjectInfo(projectId) {
  console.log(`프로젝트 정보 추출 시도: ${projectId}`);
  const projectUrl = `https://playentry.org/project/${projectId}`;
  
  try {
    // 프로젝트 페이지 요청
    const res = await fetch(projectUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
      },
    });
    
    if (!res.ok) {
      throw new Error(`프로젝트 페이지 요청 실패: ${res.status}`);
    }
    
    // HTML 파싱
    const html = await res.text();
    console.log(`프로젝트 ${projectId} HTML 길이: ${html.length}`);
    
    // 결과 객체 초기화
    const result = {
      id: projectId,
      name: `프로젝트 ${projectId}`,
      thumb: '',
      user: {
        id: '',
        nickname: '',
        profileImage: {
          filename: ''
        }
      },
      visit: 0,
      likeCnt: 0,
      comment: 0,
      saveCount: 0
    };
    
    // ==================== 방법 1: window.__INITIAL_STATE__ JSON 데이터 추출 ====================
    let initialState = null;
    try {
      const stateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/i);
      if (stateMatch) {
        console.log("Initial state JSON 문자열 찾음");
        try {
          initialState = JSON.parse(stateMatch[1]);
          console.log("Initial state 파싱 성공");
          
          if (initialState.project && initialState.project.project) {
            const projectData = initialState.project.project;
            console.log("Initial state에서 프로젝트 데이터 찾음:", Object.keys(projectData).join(", "));
            
            // 프로젝트 기본 정보
            if (projectData.name) result.name = projectData.name;
            if (projectData.thumb) result.thumb = projectData.thumb;
            
            // 통계 정보
            if (typeof projectData.visit === 'number') result.visit = projectData.visit;
            if (typeof projectData.likeCnt === 'number') result.likeCnt = projectData.likeCnt;
            if (typeof projectData.comment === 'number') result.comment = projectData.comment;
            if (typeof projectData.saveCount === 'number') result.saveCount = projectData.saveCount;
            
            // 사용자 정보
            if (projectData.user) {
              if (projectData.user.id) result.user.id = projectData.user.id;
              if (projectData.user.nickname) result.user.nickname = projectData.user.nickname;
              if (projectData.user.profileImage && projectData.user.profileImage.filename) {
                result.user.profileImage.filename = projectData.user.profileImage.filename;
              }
            }
            
            console.log("Initial state에서 추출한 정보:", {
              name: result.name,
              visit: result.visit,
              likeCnt: result.likeCnt,
              comment: result.comment,
              saveCount: result.saveCount
            });
            
            // 만약 모든 정보가 제대로 채워졌다면 바로 반환
            if (result.name && result.thumb && result.user.id && result.visit > 0) {
              console.log("Initial state에서 모든 정보 추출 완료. 결과 반환");
              return result;
            }
          }
        } catch (e) {
          console.error("Initial state 파싱 중 오류:", e);
        }
      } else {
        console.log("Initial state 문자열을 찾지 못함");
      }
    } catch (e) {
      console.error("Initial state 추출 시도 중 오류:", e);
    }
    
    // ==================== 방법 2: 다양한 JSON 데이터 패턴 추출 ====================
    try {
      // JSON 형태의 데이터를 모두 찾아보기
      const jsonPatterns = [
        /"({[^{}]*"projectInfo"[^{}]*})"/i,
        /({[^{}]*"likeCnt"[^{}]*})/i,
        /data-project='({[^']*})'/i,
        /data-project="({[^"]*)"/i,
        /projectInfo\s*:\s*({[\s\S]*?}),\s*isLike/i
      ];
      
      for (const pattern of jsonPatterns) {
        const match = html.match(pattern);
        if (match) {
          console.log(`JSON 패턴 ${pattern} 매치 발견`);
          try {
            // JSON 문자열 정리 및 변환
            let jsonStr = match[1]
              .replace(/\\/g, '\\\\') // 백슬래시 처리
              .replace(/'/g, '"')     // 작은따옴표를 큰따옴표로
              .replace(/([{,])\s*(\w+):/g, '$1"$2":') // 따옴표 없는 키에 따옴표 추가
              .replace(/,\s*}/g, '}') // 마지막 콤마 제거
              .replace(/,\s*,/g, ','); // 연속 콤마 처리
            
            const data = JSON.parse(jsonStr);
            console.log("JSON 데이터 파싱 성공:", Object.keys(data).join(", "));
            
            // 정보 추출
            if (data.name && !result.name) result.name = data.name;
            if (data.thumb && !result.thumb) result.thumb = data.thumb;
            if (data.visit && !result.visit) result.visit = data.visit;
            if (data.likeCnt && !result.likeCnt) result.likeCnt = data.likeCnt;
            if (data.comment && !result.comment) result.comment = data.comment;
            if (data.saveCount && !result.saveCount) result.saveCount = data.saveCount;
            
            // 중첩된 객체 처리
            if (data.projectInfo) {
              if (data.projectInfo.name && !result.name) result.name = data.projectInfo.name;
              if (data.projectInfo.thumb && !result.thumb) result.thumb = data.projectInfo.thumb;
              if (data.projectInfo.visit && !result.visit) result.visit = data.projectInfo.visit;
              if (data.projectInfo.likeCnt && !result.likeCnt) result.likeCnt = data.projectInfo.likeCnt;
              if (data.projectInfo.comment && !result.comment) result.comment = data.projectInfo.comment;
              if (data.projectInfo.saveCount && !result.saveCount) result.saveCount = data.projectInfo.saveCount;
            }
            
            console.log("JSON 데이터에서 추출한 정보:", {
              name: result.name,
              visit: result.visit,
              likeCnt: result.likeCnt,
              comment: result.comment,
              saveCount: result.saveCount
            });
          } catch (e) {
            console.error(`JSON 패턴 ${pattern} 파싱 실패:`, e);
          }
        }
      }
    } catch (e) {
      console.error("JSON 패턴 추출 시도 중 오류:", e);
    }
    
    // ==================== 방법 3: HTML 메타데이터 추출 ====================
    try {
      // 제목 추출
      if (!result.name) {
        const titleMatches = [
          html.match(/<title>(.*?) - Entry<\/title>/i),
          html.match(/<title>(.*?)<\/title>/i),
          html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i),
          html.match(/<h1[^>]*class=["'][^"']*ProjectInfo_title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i),
          html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)
        ];
        
        for (const match of titleMatches) {
          if (match) {
            result.name = match[1].trim();
            console.log(`제목 추출 성공: ${result.name}`);
            break;
          }
        }
      }
      
      // 썸네일 추출
      if (!result.thumb) {
        const thumbMatches = [
          html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i),
          html.match(/["']thumb["']\s*:\s*["']([^"']+)["']/i),
          html.match(/background-image\s*:\s*url\(['"]([^'"]+)['"]\)/i)
        ];
        
        for (const match of thumbMatches) {
          if (match) {
            result.thumb = match[1].trim();
            console.log(`썸네일 추출 성공: ${result.thumb}`);
            break;
          }
        }
      }
      
      // 사용자 정보 추출
      if (!result.user.id) {
        const userIdMatch = html.match(/\/profile\/([A-Za-z0-9]+)["']/i);
        if (userIdMatch) {
          result.user.id = userIdMatch[1];
          console.log(`사용자 ID 추출 성공: ${result.user.id}`);
        }
      }
      
      if (!result.user.nickname) {
        const nicknameMatches = [
          html.match(/["']nickname["']\s*:\s*["']([^"']+)["']/i),
          html.match(/<a[^>]*href=["']\/profile\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/i)
        ];
        
        for (const match of nicknameMatches) {
          if (match) {
            result.user.nickname = match[1].trim();
            console.log(`사용자 닉네임 추출 성공: ${result.user.nickname}`);
            break;
          }
        }
      }
      
      if (!result.user.profileImage.filename) {
        const profileMatches = [
          html.match(/["']profileImage["'][\s\S]*?["']filename["']\s*:\s*["']([^"']+)["']/i),
          html.match(/avatar[\s\S]*?background-image\s*:\s*url\(['"]([^'"]+)['"]\)/i)
        ];
        
        for (const match of profileMatches) {
          if (match) {
            result.user.profileImage.filename = match[1].trim();
            console.log(`프로필 이미지 추출 성공: ${result.user.profileImage.filename}`);
            break;
          }
        }
      }
    } catch (e) {
      console.error("메타데이터 추출 시도 중 오류:", e);
    }
    
    // ==================== 방법 4: 통계 정보 직접 추출 ====================
    try {
      // 통계 블록 찾기
      const statsBlockMatch = html.match(/<div[^>]*class=["'][^"']*ProjectInfo_stats[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ||
                              html.match(/<div[^>]*class=["'][^"']*stats[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
      
      if (statsBlockMatch) {
        const statsBlock = statsBlockMatch[1];
        console.log("통계 블록 찾음");
        
        // 조회수
        if (result.visit === 0) {
          const viewMatch = statsBlock.match(/view[^>]*>([0-9,]+)</i) ||
                            statsBlock.match(/조회[^>]*>([0-9,]+)</i);
          if (viewMatch) {
            result.visit = parseInt(viewMatch[1].replace(/,/g, ''));
            console.log(`조회수 추출 성공: ${result.visit}`);
          }
        }
        
        // 좋아요
        if (result.likeCnt === 0) {
          const likeMatch = statsBlock.match(/like[^>]*>([0-9,]+)</i) ||
                            statsBlock.match(/좋아요[^>]*>([0-9,]+)</i) ||
                            statsBlock.match(/heart[^>]*>([0-9,]+)</i);
          if (likeMatch) {
            result.likeCnt = parseInt(likeMatch[1].replace(/,/g, ''));
            console.log(`좋아요 추출 성공: ${result.likeCnt}`);
          }
        }
        
        // 댓글
        if (result.comment === 0) {
          const commentMatch = statsBlock.match(/comment[^>]*>([0-9,]+)</i) ||
                               statsBlock.match(/댓글[^>]*>([0-9,]+)</i);
          if (commentMatch) {
            result.comment = parseInt(commentMatch[1].replace(/,/g, ''));
            console.log(`댓글 추출 성공: ${result.comment}`);
          }
        }
        
        // 저장
        if (result.saveCount === 0) {
          const saveMatch = statsBlock.match(/bookmark[^>]*>([0-9,]+)</i) ||
                            statsBlock.match(/저장[^>]*>([0-9,]+)</i) ||
                            statsBlock.match(/save[^>]*>([0-9,]+)</i);
          if (saveMatch) {
            result.saveCount = parseInt(saveMatch[1].replace(/,/g, ''));
            console.log(`저장 횟수 추출 성공: ${result.saveCount}`);
          }
        }
      } else {
        console.log("통계 블록을 찾지 못함, 전체 HTML에서 검색");
        
        // 전체 HTML에서 검색
        if (result.visit === 0) {
          const visitMatches = [
            html.match(/["']visit["']\s*:\s*(\d+)/i),
            html.match(/조회\s*(?:<[^>]*>)*\s*([0-9,]+)/i),
            html.match(/view\s*(?:<[^>]*>)*\s*([0-9,]+)/i)
          ];
          
          for (const match of visitMatches) {
            if (match) {
              result.visit = parseInt(match[1].replace(/,/g, ''));
              console.log(`조회수 추출 성공: ${result.visit}`);
              break;
            }
          }
        }
        
        if (result.likeCnt === 0) {
          const likeMatches = [
            html.match(/["']likeCnt["']\s*:\s*(\d+)/i),
            html.match(/좋아요\s*(?:<[^>]*>)*\s*([0-9,]+)/i),
            html.match(/heart\s*(?:<[^>]*>)*\s*([0-9,]+)/i),
            html.match(/like\s*(?:<[^>]*>)*\s*([0-9,]+)/i)
          ];
          
          for (const match of likeMatches) {
            if (match) {
              result.likeCnt = parseInt(match[1].replace(/,/g, ''));
              console.log(`좋아요 추출 성공: ${result.likeCnt}`);
              break;
            }
          }
        }
        
        if (result.comment === 0) {
          const commentMatches = [
            html.match(/["']comment["']\s*:\s*(\d+)/i),
            html.match(/댓글\s*(?:<[^>]*>)*\s*([0-9,]+)/i),
            html.match(/comment\s*(?:<[^>]*>)*\s*([0-9,]+)/i)
          ];
          
          for (const match of commentMatches) {
            if (match) {
              result.comment = parseInt(match[1].replace(/,/g, ''));
              console.log(`댓글 추출 성공: ${result.comment}`);
              break;
            }
          }
        }
        
        if (result.saveCount === 0) {
          const saveMatches = [
            html.match(/["']saveCount["']\s*:\s*(\d+)/i),
            html.match(/저장\s*(?:<[^>]*>)*\s*([0-9,]+)/i),
            html.match(/bookmark\s*(?:<[^>]*>)*\s*([0-9,]+)/i),
            html.match(/save\s*(?:<[^>]*>)*\s*([0-9,]+)/i)
          ];
          
          for (const match of saveMatches) {
            if (match) {
              result.saveCount = parseInt(match[1].replace(/,/g, ''));
              console.log(`저장 횟수 추출 성공: ${result.saveCount}`);
              break;
            }
          }
        }
      }
    } catch (e) {
      console.error("통계 정보 추출 시도 중 오류:", e);
    }
    
    // 결과 요약 로깅
    console.log(`프로젝트 ${projectId} 정보 추출 결과:`, {
      name: result.name,
      thumb: result.thumb ? result.thumb.substring(0, 30) + '...' : '없음',
      user: {
        id: result.user.id,
        nickname: result.user.nickname
      },
      visit: result.visit,
      likeCnt: result.likeCnt,
      comment: result.comment,
      saveCount: result.saveCount
    });
    
    return result;
    
  } catch (error) {
    console.error(`프로젝트 ${projectId} 처리 중 오류:`, error);
    // 기본값 반환
    return {
      id: projectId,
      name: `프로젝트 ${projectId}`,
      thumb: '',
      user: {
        id: '',
        nickname: '알 수 없음',
        profileImage: {
          filename: ''
        }
      },
      visit: 0,
      likeCnt: 0,
      comment: 0,
      saveCount: 0
    };
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    console.log("Incoming request:", url.toString());

    // 메인 페이지: URL 입력 폼 (GET "/")
    if (url.pathname === "/" && request.method === "GET") {
      const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <title>작품 그룹 생성</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; padding: 20px; line-height: 1.6; }
      .container { max-width: 800px; margin: 0 auto; }
      .card { border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
      h1, h2 { color: #333; }
      textarea, input[type="text"] { width: 100%; padding: 8px; box-sizing: border-box; margin-bottom: 10px; }
      button { background-color: #4CAF50; color: white; border: none; padding: 10px 15px; border-radius: 4px; cursor: pointer; }
      button:hover { background-color: #45a049; }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>작품 그룹 생성</h1>
      
      <div class="card">
        <h2>프로젝트 그룹 생성</h2>
        <p>프로젝트 URL을 입력하고 그룹을 생성하세요.</p>
        <form method="POST" action="/create" id="createForm">
          <div>
            <label for="urls">프로젝트 URL 목록:</label>
            <textarea name="urls" id="urls" rows="10" placeholder="https://playentry.org/project/프로젝트ID 를 한 줄에 하나씩 입력"></textarea>
          </div>
          <button type="submit">작품 그룹 생성</button>
        </form>
      </div>
    </div>
  </body>
</html>`;
      return new Response(html, {
        headers: { "Content-Type": "text/html;charset=UTF-8" },
      });
    }
    
    // 그룹 생성 처리 (POST "/create")
    if (url.pathname === "/create" && request.method === "POST") {
      try {
        const formData = await request.formData();
        const urlsText = formData.get("urls");
        
        if (!urlsText) {
          return new Response("URL이 입력되지 않았습니다.", { status: 400 });
        }
        
        // 줄 단위로 분리 후 유효한 URL 필터링
        const urls = urlsText
          .split("\n")
          .map(line => line.trim())
          .filter(line =>
            /^https:\/\/playentry\.org\/project\/[A-Za-z0-9]+/.test(line)
          );
        if (urls.length === 0) {
          return new Response("유효한 URL이 없습니다.", { status: 400 });
        }
        // 8자리 그룹 코드 생성
        const code = Math.random().toString(36).substring(2, 10);
        // R2 버킷 (PROJECT_GROUPS 바인딩) 저장 (JSON 형태)
        await env.PROJECT_GROUPS.put(code, JSON.stringify({ urls }));
        
        const domain = url.hostname;
        const responseHtml = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <title>그룹 생성 완료</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; padding: 20px; line-height: 1.6; }
      .container { max-width: 800px; margin: 0 auto; }
      .card { border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
      h1 { color: #333; }
      .success { color: #4CAF50; }
      .group-info { background-color: #f8f9fa; padding: 15px; border-radius: 4px; margin: 15px 0; }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>그룹 생성 완료</h1>
      <div class="card">
        <h2 class="success">그룹이 성공적으로 생성되었습니다!</h2>
        <div class="group-info">
          <p><strong>생성된 그룹 코드:</strong> ${code}</p>
          <p><strong>접속 URL:</strong> <a href="https://${domain}/${code}">https://${domain}/${code}</a></p>
          <p><strong>프로젝트 수:</strong> ${urls.length}개</p>
        </div>
        <p><a href="/">처음으로 돌아가기</a></p>
      </div>
    </div>
  </body>
</html>`;
        return new Response(responseHtml, {
          headers: { "Content-Type": "text/html;charset=UTF-8" },
        });
      } catch (err) {
        console.error("Error in /create:", err);
        return new Response("그룹 생성 중 에러 발생: " + err.message, {
          headers: { "Content-Type": "text/plain;charset=UTF-8" },
          status: 500,
        });
      }
    }

    // 그룹 페이지: 생성된 8자리 코드로 접속 (GET "/{code}")
    if (url.pathname.length === 9 && url.pathname.startsWith("/")) {
      const code = url.pathname.slice(1);
      try {
        // R2에서 그룹 정보 가져오기
        const object = await env.PROJECT_GROUPS.get(code);
        if (!object) {
          return new Response("해당 그룹을 찾을 수 없습니다.", { status: 404 });
        }
        const stored = await object.json();
        const urls = stored.urls;
        
        let listItems = "";
        // 각 프로젝트 URL 처리
        for (const projectUrl of urls) {
          const match = projectUrl.match(/playentry\.org\/project\/([A-Za-z0-9]+)/);
          if (!match) continue;
          const projectId = match[1];
          try {
            // 프로젝트 페이지에서 직접 정보 추출
            const project = await extractProjectInfo(projectId);
            console.log(`프로젝트 ${projectId} 정보 추출 성공:`, project.name);
            
            listItems += `<li class="project-item">
  <div class="project-card">
    <div class="project-thumb" style="background-image: url('${project.thumb}'), url('/img/DefaultCardThmb.svg');">
    </div>
    <div class="project-info">
      <a href="https://playentry.org/project/${project.id}" class="project-title">${project.name}</a>
      <div class="user-info">
        <a href="https://playentry.org/profile/${project.user.id}" class="user-link">
          <span class="user-avatar" style="background-image: url('${project.user.profileImage.filename}');"></span>
          <span class="user-name">${project.user.nickname}</span>
        </a>
      </div>
    </div>
    <div class="project-stats">
      <span class="stat"><i class="icon-view"></i> ${project.visit || 0}</span>
      <span class="stat"><i class="icon-like"></i> ${project.likeCnt || 0}</span>
      <span class="stat"><i class="icon-comment"></i> ${project.comment || 0}</span>
      <span class="stat"><i class="icon-bookmark"></i> ${project.saveCount || 0}</span>
    </div>
  </div>
</li>`;
          } catch (err) {
            console.error(`Error processing project ${projectId}:`, err);
            listItems += `<li class="error-item">프로젝트 ${projectId} 데이터를 불러오는데 실패했습니다. (${err.message})</li>`;
          }
        }
        const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <title>프로젝트 그룹 - ${code}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
      .container { max-width: 1200px; margin: 0 auto; }
      h1 { color: #333; text-align: center; margin-bottom: 30px; }
      .project-list { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
      .project-item { background-color: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
      .project-card { display: flex; flex-direction: column; height: 100%; }
      .project-thumb { height: 180px; background-size: cover; background-position: center; background-color: #eee; }
      .project-info { padding: 15px; flex-grow: 1; }
      .project-title { font-size: 18px; font-weight: bold; color: #333; text-decoration: none; display: block; margin-bottom: 10px; }
      .project-title:hover { color: #1a73e8; }
      .user-info { display: flex; align-items: center; margin-bottom: 10px; }
      .user-link { display: flex; align-items: center; text-decoration: none; color: #666; }
      .user-avatar { width: 24px; height: 24px; border-radius: 50%; background-size: cover; margin-right: 8px; background-color: #ddd; }
      .user-name { font-size: 14px; }
      .project-stats { display: flex; background-color: #f9f9f9; padding: 10px 15px; border-top: 1px solid #eee; }
      .stat { display: flex; align-items: center; margin-right: 15px; font-size: 13px; color: #666; }
      .error-item { padding: 15px; color: #721c24; background-color: #f8d7da; border: 1px solid #f5c6cb; border-radius: 8px; }
      .icon-view:before { content: "👁️"; margin-right: 5px; }
      .icon-like:before { content: "❤️"; margin-right: 5px; }
      .icon-comment:before { content: "💬"; margin-right: 5px; }
      .icon-bookmark:before { content: "🔖"; margin-right: 5px; }
      .home-link { display: block; text-align: center; margin-top: 20px; color: #1a73e8; text-decoration: none; }
      .home-link:hover { text-decoration: underline; }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>프로젝트 그룹 - ${code}</h1>
      <ul class="project-list">
        ${listItems}
      </ul>
      <a href="/" class="home-link">처음으로 돌아가기</a>
    </div>
  </body>
</html>`;
        return new Response(html, {
          headers: { "Content-Type": "text/html;charset=UTF-8" },
        });
      } catch (err) {
        console.error("Error in group page:", err);
        return new Response("그룹 페이지 처리 중 에러 발생: " + err.message, {
          headers: { "Content-Type": "text/plain;charset=UTF-8" },
          status: 500,
        });
      }
    }

    return new Response("Not found", { status: 404 });
  },
};